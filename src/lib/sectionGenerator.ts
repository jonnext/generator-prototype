// Section Generator — DP1.5.B.
//
// Ports the production section-generator agent pattern
// (projects-app/backend/projects/ai/agents/projectsectiongenerator/agent.go)
// into the prototype. Given a step heading, the outline context, optional
// research content, and the NEXTWORK_STEP_STANDARDS, asks Claude to return
// a JSON array of ContentBlock entries for the step body. Validates against
// the DP1.5.A 5-type discriminated union and retries once (production's
// retry-with-error-feedback loop, capped at 2 attempts total for prototype
// speed vs production's 6).
//
// Callers are Phase B in App.tsx (DP1.5.F onward) — one call per step in
// parallel on initial materialization, and again per-step on sculpting
// re-fire (DP1.5.I). Failure surfaces as a thrown Error; the wiring layer
// decides how to render the failure (typically: leave step.blocks
// undefined so the shimmer placeholder stays).

import { callClaude } from './claude'
import { flattenBlocksToText } from './contentBlock'
import type {
  CalloutBlock,
  CalloutVariant,
  CodeBlock,
  ContentBlock,
  HeadingBlock,
  InlineMark,
  ListBlock,
  ListItem,
  ListVariant,
  ParagraphBlock,
  TextSpan,
} from './state'
import { NEXTWORK_STEP_STANDARDS } from './standards'

// ----------------------------------------------------------------------------
// Public input / output shape
// ----------------------------------------------------------------------------

export interface OutlineContext {
  /** Project title — e.g. "Build a Discord Bot". */
  title: string
  /** One-sentence description — names the end artifact. */
  description: string
  /** "beginner" | "intermediate" | "advanced". Optional; older skeletons omit it. */
  difficulty?: string
  /** Short slug like "serverless" or "cooking". Optional. */
  category?: string
  /** All step headings in the current pathway, in order. Gives Claude the
   *  full narrative context so substeps don't collide with sibling steps. */
  allStepHeadings: string[]
  /** 0-based index of the step being generated. */
  currentStepIndex: number
}

/**
 * DP1.7.D — PriorStepContext lets a step N prompt receive steps 1..N-1's
 * already-generated rendered blocks as ground truth. The prompt builder
 * flattens the blocks via flattenBlocksToText and prepends them to the user
 * prompt before NEXTWORK_STEP_STANDARDS so Claude continues from concrete
 * facts (filenames, code, commands, decisions) rather than hallucinating
 * a parallel reality from the outline alone.
 */
export interface PriorStepContext {
  heading: string
  blocks: ContentBlock[]
}

export interface GenerateStepBlocksInput {
  stepId: string
  stepHeading: string
  outline: OutlineContext
  /**
   * Pre-formatted research context (Exa + Perplexity + Firecrawl snippets).
   * Optional — empty string or undefined disables research injection. The
   * format helper that builds this lives alongside the research store in
   * DP1.5.D; this function only cares about the formatted string.
   */
  research?: string
  /**
   * DP1.7.D — chronological list of prior steps' headings + already-generated
   * blocks. Empty / undefined for step 1 (the always-fired initial step).
   * Steps 2..N receive the full prefix so each call has a complete picture
   * of what came before. Phase B's step-1-only mode passes [] here;
   * triggerNextStep populates from latestPlan.steps.slice(0, stepIndex).
   */
  priorSteps?: PriorStepContext[]
  /**
   * Override the standards embedded in the system prompt. Defaults to
   * NEXTWORK_STEP_STANDARDS. Exposed for tests and for future use cases
   * like per-topic standard overlays.
   */
  standards?: string
  /** Max retries on validation failure. Default 1 (so 2 attempts total). */
  maxRetries?: number
  /** Propagated to the Claude fetch for interrupt support. */
  signal?: AbortSignal
}

// ----------------------------------------------------------------------------
// Main entry point — generate → parse → validate → retry-once
// ----------------------------------------------------------------------------

export async function generateStepBlocks(
  input: GenerateStepBlocksInput,
): Promise<ContentBlock[]> {
  const maxRetries = input.maxRetries ?? 1
  let previousAttempt: string | null = null
  let previousErrors: string[] = []

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { system, user } = buildSectionPrompt({
      ...input,
      previousAttempt,
      previousErrors,
    })

    const raw = await callClaude({
      system,
      messages: [{ role: 'user', content: user }],
      signal: input.signal,
      // Section content runs longer than the 2048-token skeleton default —
      // a typical 8-15 block step with code samples lands around 3-4 KB of
      // JSON, which can exceed 1500 tokens if code is verbose.
      maxTokens: 4096,
    })

    const parsed = parseBlocksArray(raw)
    if (parsed.kind === 'parse-failed') {
      previousAttempt = raw
      previousErrors = [parsed.reason]
      continue
    }

    const validation = validateBlocks(parsed.value)
    if (validation.errors.length === 0) {
      return validation.blocks
    }

    previousAttempt = raw
    previousErrors = validation.errors
  }

  throw new Error(
    `Section generation failed after ${maxRetries + 1} attempts. ` +
      `Last errors: ${previousErrors.join('; ')}`,
  )
}

// ----------------------------------------------------------------------------
// Prompt builder
// ----------------------------------------------------------------------------

interface BuildSectionPromptInput extends GenerateStepBlocksInput {
  previousAttempt: string | null
  previousErrors: string[]
}

interface BuildSectionPromptOutput {
  system: string
  user: string
}

export function buildSectionPrompt(
  input: BuildSectionPromptInput,
): BuildSectionPromptOutput {
  const {
    stepHeading,
    outline,
    research,
    priorSteps,
    standards,
    previousAttempt,
    previousErrors,
  } = input

  const hasResearch = typeof research === 'string' && research.trim().length > 0
  const hasPriorSteps = Array.isArray(priorSteps) && priorSteps.length > 0
  const isRetry = previousAttempt !== null

  const system = [
    'You are the NextWork section content generator. Your job is to write ONE step\'s body content for a learning project, emitted as a JSON array of content blocks. You will receive NextWork content standards below — they are the source of truth for structure, tone, and formatting. Follow them exactly.',
    '',
    '--- NEXTWORK_STEP_STANDARDS START ---',
    standards ?? NEXTWORK_STEP_STANDARDS,
    '--- NEXTWORK_STEP_STANDARDS END ---',
    '',
    '## Available Block Types',
    '',
    'Only these 5 block types are allowed. Do NOT emit any other type.',
    '',
    '### paragraph',
    '{"type": "paragraph", "content": [{"text": "...", "marks": []}]}',
    '',
    '### heading (level 4 only inside step bodies)',
    '{"type": "heading", "level": 4, "content": [{"text": "...", "marks": []}]}',
    '',
    '### list',
    '{"type": "list", "listType": "task" | "unordered" | "ordered", "items": [{"content": [{"text": "...", "marks": []}]}]}',
    '',
    '### code',
    '{"type": "code", "language": "bash", "code": "...", "filename": "optional-filename"}',
    '',
    '### callout',
    '{"type": "callout", "variant": "tip" | "info" | "troubleshooting" | "announcement" | "costWarning" | "error", "title": "...", "blocks": [<nested content blocks>]}',
    '',
    '## Inline Marks',
    '',
    'Text spans can carry inline formatting marks:',
    '- bold:   {"text": "important", "marks": [{"type": "bold"}]}',
    '- italic: {"text": "emphasis", "marks": [{"type": "italic"}]}',
    '- code:   {"text": "command",   "marks": [{"type": "code"}]}',
    '- link:   {"text": "click here", "marks": [{"type": "link", "href": "https://..."}]}',
    '',
    'A TextSpan with no formatting has marks: [] (or omits the marks field).',
    '',
    '## JSON Output Rules',
    '',
    '- Return ONLY a single JSON array. Start with [ and end with ].',
    '- No prose before or after. No code fences.',
    '- Omit the id field on every block (the renderer assigns IDs).',
    '- Match the exact shape of the block types above.',
    '- Escape newlines in string values as \\n. Never put raw line breaks inside a JSON string value.',
    '- Escape tabs as \\t. Escape double quotes inside strings as \\".',
    '- In code blocks with multi-line code, join lines with \\n inside the "code" field.',
    ...(hasResearch
      ? [
          '',
          '## Research Freshness Priority',
          '',
          'You have been given research snippets from Exa, Perplexity, and Firecrawl. Firecrawl content is live-read from the web AS OF RIGHT NOW. Prefer Firecrawl-sourced facts when they conflict with your prior training knowledge — Firecrawl is the source of truth for current state of evolving products (SDKs, CLIs, APIs that update frequently).',
        ]
      : []),
    ...(isRetry
      ? [
          '',
          '## Retry — Previous Output Failed Validation',
          '',
          'Your previous attempt did not parse or did not pass validation. Fix the issues listed below in your new attempt. Return the FULL corrected JSON array, not just the changed parts.',
          '',
          'Previous output:',
          previousAttempt!,
          '',
          'Validation errors:',
          previousErrors.map((e) => `- ${e}`).join('\n'),
        ]
      : []),
  ].join('\n')

  const allHeadings = outline.allStepHeadings
    .map((h, i) => `${i + 1}. ${h}`)
    .join('\n')
  const stepNumber = outline.currentStepIndex + 1
  const totalSteps = outline.allStepHeadings.length

  // DP1.7.D — when we have prior steps' generated content, prepend it as a
  // ground-truth anchor so step N continues from concrete artifacts (commands,
  // code, decisions) rather than re-deriving from the outline. Production's
  // hallucination cascade originated from each step running independently
  // against the outline only; this is the structural fix.
  const priorStepsSection = hasPriorSteps
    ? [
        "## What's already been generated (chronological — these are facts)",
        '',
        ...priorSteps!.flatMap((prior, i) => [
          `### Step ${i + 1}: ${prior.heading}`,
          flattenBlocksToText(prior.blocks),
          '',
        ]),
        '---',
        '',
        `## Now generate Step ${stepNumber}: ${stepHeading}`,
        '',
        'These prior steps are facts. Continue from them. Don\'t repeat content already covered. Don\'t contradict prior decisions, code, commands, or artifacts. Reference prior outputs by name where natural ("the Dockerfile from Step 1 — ...", "the bucket you created in Step 2 — ...").',
        '',
      ]
    : []

  const user = [
    ...priorStepsSection,
    'PROJECT OUTLINE:',
    `Title: ${outline.title}`,
    `Description: ${outline.description}`,
    ...(outline.difficulty ? [`Difficulty: ${outline.difficulty}`] : []),
    ...(outline.category ? [`Category: ${outline.category}`] : []),
    '',
    'All step headings (for narrative context — do NOT duplicate work that belongs in sibling steps):',
    allHeadings,
    '',
    'CURRENT STEP:',
    `You are writing Step ${stepNumber} of ${totalSteps}: "${stepHeading}"`,
    '',
    'Return a JSON array of content blocks for this step body. Follow the NextWork step content standards exactly — opening narrative paragraph, task list (listType: task) with 2-3 items, then up to 3 substeps (each a level-4 heading + optional paragraph + unordered list + optional code block). Use callouts for "why this approach" notes when appropriate.',
    ...(hasResearch
      ? [
          '',
          '---',
          'RESEARCH CONTEXT (grounded evidence — use this to choose accurate, current primitives):',
          '',
          research!.trim(),
        ]
      : []),
  ].join('\n')

  return { system, user }
}

// ----------------------------------------------------------------------------
// Parser — find and parse the JSON array, tolerate leading/trailing junk
// ----------------------------------------------------------------------------

type ParseResult =
  | { kind: 'ok'; value: unknown[] }
  | { kind: 'parse-failed'; reason: string }

export function parseBlocksArray(raw: string): ParseResult {
  const stripped = stripCodeFences(raw).trim()
  const arrayStart = stripped.indexOf('[')
  const arrayEnd = stripped.lastIndexOf(']')
  if (arrayStart === -1 || arrayEnd === -1 || arrayEnd <= arrayStart) {
    return {
      kind: 'parse-failed',
      reason: 'Response did not contain a JSON array (no matching [ and ])',
    }
  }
  const jsonText = stripped.slice(arrayStart, arrayEnd + 1)

  try {
    const parsed = JSON.parse(jsonText)
    if (!Array.isArray(parsed)) {
      return {
        kind: 'parse-failed',
        reason: 'Parsed JSON was not an array',
      }
    }
    return { kind: 'ok', value: parsed }
  } catch (err) {
    return {
      kind: 'parse-failed',
      reason: `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ----------------------------------------------------------------------------
// Validator — walks the parsed array, checks each block against the
// DP1.5.A discriminated union, assigns IDs via crypto.randomUUID.
// ----------------------------------------------------------------------------

interface ValidationResult {
  /** Blocks that passed validation, with IDs assigned. */
  blocks: ContentBlock[]
  /** Human-readable error strings. Empty on success. */
  errors: string[]
}

const ALLOWED_BLOCK_TYPES = ['paragraph', 'heading', 'list', 'code', 'callout'] as const
type AllowedBlockType = (typeof ALLOWED_BLOCK_TYPES)[number]

const ALLOWED_LIST_TYPES: ListVariant[] = ['ordered', 'unordered', 'task']

const ALLOWED_CALLOUT_VARIANTS: CalloutVariant[] = [
  'info',
  'tip',
  'troubleshooting',
  'announcement',
  'costWarning',
  'error',
]

const ALLOWED_MARK_TYPES = ['bold', 'italic', 'code', 'link'] as const

export function validateBlocks(rawBlocks: unknown[]): ValidationResult {
  const errors: string[] = []
  const blocks: ContentBlock[] = []

  rawBlocks.forEach((rawBlock, i) => {
    const validated = validateBlock(rawBlock, `blocks[${i}]`, errors)
    if (validated !== null) blocks.push(validated)
  })

  return { blocks, errors }
}

function validateBlock(
  raw: unknown,
  path: string,
  errors: string[],
): ContentBlock | null {
  if (!isRecord(raw)) {
    errors.push(`${path} is not an object`)
    return null
  }

  const type = raw.type
  if (typeof type !== 'string') {
    errors.push(`${path}.type is missing or not a string`)
    return null
  }

  if (!ALLOWED_BLOCK_TYPES.includes(type as AllowedBlockType)) {
    errors.push(
      `${path}.type "${type}" is not one of ${ALLOWED_BLOCK_TYPES.join(', ')}`,
    )
    return null
  }

  const id = newBlockId()

  switch (type as AllowedBlockType) {
    case 'paragraph':
      return buildParagraph(raw, path, errors, id)
    case 'heading':
      return buildHeading(raw, path, errors, id)
    case 'list':
      return buildList(raw, path, errors, id)
    case 'code':
      return buildCode(raw, path, errors, id)
    case 'callout':
      return buildCallout(raw, path, errors, id)
  }
}

function buildParagraph(
  raw: Record<string, unknown>,
  path: string,
  errors: string[],
  id: string,
): ParagraphBlock | null {
  const content = validateTextSpans(raw.content, `${path}.content`, errors)
  if (content === null) return null
  return { id, type: 'paragraph', content }
}

function buildHeading(
  raw: Record<string, unknown>,
  path: string,
  errors: string[],
  id: string,
): HeadingBlock | null {
  // Step-body headings are level 4 only per NEXTWORK_STEP_STANDARDS. Other
  // levels are a structural violation — step-level titles render from
  // Step.heading, not from a HeadingBlock inside Step.blocks.
  const level = raw.level
  if (level !== 4) {
    errors.push(
      `${path}.level must be 4 (only level 4 headings are allowed inside step bodies; got ${String(level)})`,
    )
    return null
  }
  const content = validateTextSpans(raw.content, `${path}.content`, errors)
  if (content === null) return null
  return { id, type: 'heading', level: 4, content }
}

function buildList(
  raw: Record<string, unknown>,
  path: string,
  errors: string[],
  id: string,
): ListBlock | null {
  const listType = raw.listType
  if (
    typeof listType !== 'string' ||
    !ALLOWED_LIST_TYPES.includes(listType as ListVariant)
  ) {
    errors.push(
      `${path}.listType "${String(listType)}" is not one of ${ALLOWED_LIST_TYPES.join(', ')}`,
    )
    return null
  }
  const rawItems = raw.items
  if (!Array.isArray(rawItems)) {
    errors.push(`${path}.items is not an array`)
    return null
  }
  const items: ListItem[] = []
  rawItems.forEach((rawItem, i) => {
    if (!isRecord(rawItem)) {
      errors.push(`${path}.items[${i}] is not an object`)
      return
    }
    const content = validateTextSpans(
      rawItem.content,
      `${path}.items[${i}].content`,
      errors,
    )
    if (content === null) return
    items.push({ content })
  })
  if (items.length === 0) {
    errors.push(`${path}.items is empty (need at least one item)`)
    return null
  }
  return { id, type: 'list', listType: listType as ListVariant, items }
}

function buildCode(
  raw: Record<string, unknown>,
  path: string,
  errors: string[],
  id: string,
): CodeBlock | null {
  const language = raw.language
  const code = raw.code
  if (typeof language !== 'string' || language.length === 0) {
    errors.push(`${path}.language must be a non-empty string`)
    return null
  }
  if (typeof code !== 'string' || code.length === 0) {
    errors.push(`${path}.code must be a non-empty string`)
    return null
  }
  const filename =
    typeof raw.filename === 'string' && raw.filename.length > 0
      ? raw.filename
      : undefined
  return { id, type: 'code', language, code, filename }
}

function buildCallout(
  raw: Record<string, unknown>,
  path: string,
  errors: string[],
  id: string,
): CalloutBlock | null {
  const variant = raw.variant
  if (
    typeof variant !== 'string' ||
    !ALLOWED_CALLOUT_VARIANTS.includes(variant as CalloutVariant)
  ) {
    errors.push(
      `${path}.variant "${String(variant)}" is not one of ${ALLOWED_CALLOUT_VARIANTS.join(', ')}`,
    )
    return null
  }
  const title = raw.title
  if (typeof title !== 'string' || title.length === 0) {
    errors.push(`${path}.title must be a non-empty string`)
    return null
  }
  const rawBlocks = raw.blocks
  if (!Array.isArray(rawBlocks)) {
    errors.push(`${path}.blocks is not an array`)
    return null
  }
  const nestedBlocks: ContentBlock[] = []
  rawBlocks.forEach((rawNested, i) => {
    const validated = validateBlock(
      rawNested,
      `${path}.blocks[${i}]`,
      errors,
    )
    if (validated !== null) nestedBlocks.push(validated)
  })
  return {
    id,
    type: 'callout',
    variant: variant as CalloutVariant,
    title,
    blocks: nestedBlocks,
  }
}

// ----------------------------------------------------------------------------
// TextSpan + InlineMark validation
// ----------------------------------------------------------------------------

function validateTextSpans(
  raw: unknown,
  path: string,
  errors: string[],
): TextSpan[] | null {
  if (!Array.isArray(raw)) {
    errors.push(`${path} is not an array`)
    return null
  }
  const spans: TextSpan[] = []
  let anyValid = false
  raw.forEach((rawSpan, i) => {
    const span = validateTextSpan(rawSpan, `${path}[${i}]`, errors)
    if (span !== null) {
      spans.push(span)
      anyValid = true
    }
  })
  if (!anyValid) {
    errors.push(`${path} had zero valid text spans`)
    return null
  }
  return spans
}

function validateTextSpan(
  raw: unknown,
  path: string,
  errors: string[],
): TextSpan | null {
  if (!isRecord(raw)) {
    errors.push(`${path} is not an object`)
    return null
  }
  const text = raw.text
  if (typeof text !== 'string') {
    errors.push(`${path}.text is missing or not a string`)
    return null
  }
  const rawMarks = raw.marks
  if (rawMarks === undefined || rawMarks === null) {
    return { text }
  }
  if (!Array.isArray(rawMarks)) {
    errors.push(`${path}.marks is not an array`)
    return null
  }
  const marks: InlineMark[] = []
  rawMarks.forEach((rawMark, i) => {
    const mark = validateInlineMark(rawMark, `${path}.marks[${i}]`, errors)
    if (mark !== null) marks.push(mark)
  })
  return marks.length > 0 ? { text, marks } : { text }
}

function validateInlineMark(
  raw: unknown,
  path: string,
  errors: string[],
): InlineMark | null {
  if (!isRecord(raw)) {
    errors.push(`${path} is not an object`)
    return null
  }
  const type = raw.type
  if (typeof type !== 'string') {
    errors.push(`${path}.type is missing or not a string`)
    return null
  }
  if (!ALLOWED_MARK_TYPES.includes(type as (typeof ALLOWED_MARK_TYPES)[number])) {
    // Production supports more mark types (concept, ask, variable). The
    // prototype strips them silently rather than failing the whole block.
    return null
  }
  if (type === 'link') {
    // Production uses marks: [{type: 'link', attrs: {href: '...'}}]. The
    // prototype flattens that to marks: [{type: 'link', href: '...'}]. We
    // accept either shape so Claude can emit the more common attrs form.
    const href =
      typeof raw.href === 'string'
        ? raw.href
        : isRecord(raw.attrs) && typeof raw.attrs.href === 'string'
          ? raw.attrs.href
          : null
    if (href === null) {
      errors.push(`${path} is a link mark but has no href`)
      return null
    }
    return { type: 'link', href }
  }
  return { type: type as 'bold' | 'italic' | 'code' }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stripCodeFences(text: string): string {
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/m)
  return fenceMatch ? fenceMatch[1] : text
}

function newBlockId(): string {
  return crypto.randomUUID()
}
