// Action Plan prompt builder.
//
// Given the student's intent (what they typed in Discovery) and their
// personal pills (duration, mode, budget), build the Claude messages that
// return the initial project skeleton: title, description, badge, and 5
// step headings with the pill decision rows each step should carry.
//
// The output is JSON. We ask Claude to return a strict object shape so the
// engine can parse it once with JSON.parse and seed the ActionPlan slice
// without any further normalization. The schema mirrors ActionPlan in
// src/lib/state.ts but with the subset of fields Claude actually fills —
// body text and isComplete are set locally as each step streams in.
//
// This builder owns the prompt, not the fetch. Callers pass the returned
// system + messages into callClaude() (non-streaming) because we need the
// whole skeleton at once to render all 5 step cards before step bodies
// start streaming in parallel.

import type { DurationId, PersonalPills } from './state'
import { modes } from './copy'

// ----------------------------------------------------------------------------
// timeMinutesToDurationId — maps the skeleton's production-aligned integer
// minutes (15/30/60/120) onto the DurationId enum the Duration pill renders.
// Used by App.tsx when applying Claude's proposed timeMinutes as an AI-picked
// personal pill. Anything off-grid rounds to the nearest known bucket so the
// pill stays in a valid state even if Claude returns a non-canonical number.
// ----------------------------------------------------------------------------

export function timeMinutesToDurationId(minutes: number): DurationId {
  const buckets: ReadonlyArray<{ minutes: number; id: DurationId }> = [
    { minutes: 15, id: '15min' },
    { minutes: 30, id: '30min' },
    { minutes: 60, id: '1hr' },
    { minutes: 120, id: '2hr' },
  ]
  let nearest = buckets[0]
  let nearestDelta = Math.abs(minutes - nearest.minutes)
  for (const bucket of buckets.slice(1)) {
    const delta = Math.abs(minutes - bucket.minutes)
    if (delta < nearestDelta) {
      nearest = bucket
      nearestDelta = delta
    }
  }
  return nearest.id
}

// ----------------------------------------------------------------------------
// Parsed shape Claude returns. Narrower than ActionPlan — no step bodies,
// no inpainting state, no isComplete. Pills contain only the decisionType
// slug; the UI fills selected/aiPicked as the student chooses.
//
// Production alignment (Thread 4): the field naming tracks the production
// projects-app `StepSection` type at:
//   projects-app/app/src/api/models/stepSection.ts:30-49 — {id, title, blocks}
// We keep the internal field name `heading` (not `title`) to avoid churning
// the downstream Step type in state.ts and the skeletonToActionPlan mapping
// in App.tsx. Semantically they are the same field; the parser tolerates
// both `heading` and `title` so model responses can swing either way without
// parse failures. Project-level metadata matches production AuthoredProject:
//   projects-app/app/src/api/models/authoredProject.ts — difficulty?, timeMinutes?, category?
// We DO NOT port `blocks[]` — body stays flat prose and renders via split-on-\n\n
// in StepCard (Thread 3), not ReactEditor.
// ----------------------------------------------------------------------------

export interface ActionPlanSkeletonStep {
  id: string
  heading: string
  /** Pill decision slugs, e.g. ['container-service', 'deployment-method']. */
  pillDecisions: string[]
}

export interface ActionPlanSkeleton {
  title: string
  description: string
  badge: string
  steps: ActionPlanSkeletonStep[]
  /** Production-aligned metadata — maps to MetadataRow pills. Optional so
   *  older responses parse cleanly. */
  difficulty?: string
  timeMinutes?: number
  category?: string
}

// ----------------------------------------------------------------------------
// Known decision slugs — Claude may ONLY reference these in pillDecisions so
// StepCard can resolve them against researchComparisons + rationales. Keep
// in sync with the keys in copy.ts rationales/researchComparisons.
// ----------------------------------------------------------------------------

export const KNOWN_DECISION_SLUGS = [
  'container-service',
  'deployment-method',
  'runtime',
  'api-framework',
  'api-hosting',
  'storage',
  'database',
  'monitoring',
  'monitoring-tool',
  'cicd-tool',
  'deploy-target',
  'monitor-target',
] as const

// ----------------------------------------------------------------------------
// Prompt builder
// ----------------------------------------------------------------------------

export interface BuildActionPlanPromptInput {
  intent: string
  personal: PersonalPills
  /** Formatted research context (Exa + Perplexity + Firecrawl results).
   *  Empty string disables research injection. Produced by
   *  formatResearchForPrompt() in src/lib/research.ts. */
  researchContext?: string
}

export interface BuildActionPlanPromptOutput {
  system: string
  user: string
}

export function buildActionPlanPrompt(
  input: BuildActionPlanPromptInput,
): BuildActionPlanPromptOutput {
  const { intent, personal, researchContext } = input
  const mode = modes.find((m) => m.id === personal.mode) ?? modes[1]
  const hasResearch = typeof researchContext === 'string' && researchContext.trim().length > 0

  const system = [
    'You are the NextWork project shaper. You help students design projects that teach a real skill. Projects can span any field — cloud, frontend, data science, machine learning, backend, developer tooling, math, physics, or anything else the student asks about. Do NOT assume a project must use AWS or any cloud provider unless the student mentions one.',
    '',
    'Your job right now is to sketch a project SKELETON, not the full build. The skeleton is a short, scannable outline that the student can immediately shape by swapping choices before any step is written in detail.',
    '',
    'Intent fidelity (MOST IMPORTANT RULE — the UI treats violations as broken output):',
    '- The project must be about EXACTLY what the student asked for. If they name a specific product, tool, framework, or platform, the project must be about THAT specific thing, not a similar-sounding alternative or a product you guess is related.',
    '- Do NOT invent cloud providers, deployment targets, API names, or technical stacks that the student did not mention. If the student says "build a Discord bot", the project is about Discord bots — not Slack, not Telegram.',
    '- If the student names a product you are not 100% certain about (e.g. "Claude Code"), stay GENERAL. Use step headings with the product name as a simple imperative verb ("Install Claude Code", "Configure Claude Code", "Run your first command with Claude Code") instead of guessing specific APIs, services, or architectures the product may not actually use.',
    '- The title must be a faithful paraphrase of the student\'s intent, not a re-interpretation. If the student says "Claude Code terminal tool", the title is "Build a Claude Code Terminal Tool" — NOT "Build a CLI Proxy to Claude via Bedrock".',
    '- The description must restate the intent in one sentence without adding tangential specifics. Do not name cloud services, frameworks, or APIs the student did not mention.',
    '- Every step heading must address the student\'s actual stated intent. If the student named a specific product, each heading should either reference that product by name or be a generic imperative that does not contradict it. Do not introduce services (Lambda, Bedrock, ECS, etc.) that the student did not ask for.',
    '- If you genuinely do not know what a named product is, design a minimal exploratory project around learning it ("Install X", "Explore the X CLI", "Build your first thing with X") rather than guessing specifics.',
    '',
    'Tone rules:',
    '- Evidence-based, direct, educational.',
    '- No motivational filler. No "let\'s dive in". No "exciting".',
    '- No em dashes. Use regular dashes or commas.',
    '- Keep step headings to 2-6 words, imperative form.',
    '- Keep the description to one sentence that names the end artifact.',
    '',
    'Output rules:',
    '- Return ONLY a single JSON object. No prose before or after. No code fences.',
    '- The JSON must match the schema in the user message exactly.',
    '- pillDecisions MUST be drawn from this allow-list:',
    `  ${KNOWN_DECISION_SLUGS.join(', ')}`,
    '- Each step may have 0-2 pillDecisions. Pick the ones the student would genuinely be deciding at that step. Do not repeat the same slug across multiple steps.',
    '- Exactly 5 steps.',
    '- Each step carries {id, heading} only at skeleton time. Step bodies are written later in a separate pass and are NOT returned here.',
    '- Project-level metadata (difficulty, timeMinutes, category) must be present on the root object so the UI can populate the Mode and Duration pills without guessing.',
    '- difficulty: one of "beginner", "intermediate", "advanced" — matches the Modes pill.',
    '- timeMinutes: integer total build time, e.g. 15, 30, 60, 120 — maps to the Duration pill.',
    '- category: short slug like "serverless", "containers", "data", "ml", "frontend".',
    ...(hasResearch
      ? [
          '',
          'Research context use:',
          '- You have been given real-time research results from a semantic search engine, an AI synthesis, and a general web search (below in the user message). These are grounded evidence for the project you design.',
          '- Use them to choose concrete, current, valid primitives (framework names, API shapes, deployment targets, costs) instead of guessing.',
          '- If sources surface a known GitHub issue, a breaking change, or a pitfall, reflect that in the step headings or pillDecisions.',
          '- Where research contains cost figures, prefer concrete numbers over vague ranges when they affect the project shape.',
          '- Do NOT dump citation URLs into the skeleton fields. The skeleton stays terse; citations surface later in step bodies.',
        ]
      : []),
  ].join('\n')

  const user = [
    'STUDENT INTENT (this is what the project must be about — take it literally, do not reinterpret or substitute adjacent topics):',
    `"${intent}"`,
    '',
    'Personal shape:',
    `- Duration: ${personal.duration}`,
    `- Mode: ${mode.name} (${mode.description})`,
    `- Budget: ${personal.budget}`,
    '',
    'Return a JSON object with this exact shape:',
    '{',
    '  "title": "string — 3-7 words, title case, no trailing period",',
    '  "description": "string — one sentence, names the end artifact",',
    '  "badge": "string — 2-3 words, lowercase, e.g. \\"serverless api\\" or \\"container deploy\\"",',
    '  "difficulty": "beginner | intermediate | advanced",',
    '  "timeMinutes": 60,',
    '  "category": "string — short slug, e.g. \\"serverless\\" or \\"containers\\"",',
    '  "steps": [',
    '    {',
    '      "id": "s1",',
    '      "heading": "string — 2-6 words, imperative",',
    '      "pillDecisions": ["optional-slug-from-allow-list"]',
    '    }',
    '  ]',
    '}',
    '',
    'Exactly 5 steps. Step ids must be s1 through s5 in order.',
    'Each step object is {id, heading, pillDecisions}. Do NOT include a body field — bodies are written in the next pass.',
    ...(hasResearch
      ? [
          '',
          '---',
          'RESEARCH CONTEXT (grounded evidence — use this to choose accurate primitives):',
          '',
          researchContext!.trim(),
        ]
      : []),
  ].join('\n')

  return { system, user }
}

// ----------------------------------------------------------------------------
// Parser — takes the Claude text output, extracts the JSON object, validates
// the shape, and returns an ActionPlanSkeleton or throws with a clear reason.
// Tolerant of accidental leading/trailing whitespace and stray code fences
// because Claude occasionally ignores format instructions on the first try.
// ----------------------------------------------------------------------------

export function parseActionPlanSkeleton(raw: string): ActionPlanSkeleton {
  const stripped = stripCodeFences(raw).trim()
  const objectStart = stripped.indexOf('{')
  const objectEnd = stripped.lastIndexOf('}')
  if (objectStart === -1 || objectEnd === -1 || objectEnd <= objectStart) {
    throw new Error('Action plan response did not contain a JSON object')
  }
  const jsonText = stripped.slice(objectStart, objectEnd + 1)

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    throw new Error(
      `Action plan JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!isRecord(parsed)) {
    throw new Error('Action plan response was not an object')
  }

  const title = asString(parsed.title, 'title')
  const description = asString(parsed.description, 'description')
  const badge = asString(parsed.badge, 'badge')

  // Thread 4 — optional production-aligned metadata. Each field silently
  // drops to undefined if the model omits it so older prompts still parse.
  const difficulty =
    typeof parsed.difficulty === 'string' && parsed.difficulty.length > 0
      ? parsed.difficulty
      : undefined
  const timeMinutes =
    typeof parsed.timeMinutes === 'number' && Number.isFinite(parsed.timeMinutes)
      ? parsed.timeMinutes
      : undefined
  const category =
    typeof parsed.category === 'string' && parsed.category.length > 0
      ? parsed.category
      : undefined

  if (!Array.isArray(parsed.steps)) {
    throw new Error('Action plan steps must be an array')
  }
  if (parsed.steps.length !== 5) {
    throw new Error(`Action plan must have exactly 5 steps, got ${parsed.steps.length}`)
  }

  const allowList = new Set<string>(KNOWN_DECISION_SLUGS)
  const steps: ActionPlanSkeletonStep[] = parsed.steps.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new Error(`Step ${index + 1} was not an object`)
    }
    const id = asString(raw.id, `steps[${index}].id`)
    // Accept `heading` (canonical) OR `title` (production-aligned). The
    // downstream Step type in state.ts uses `heading` so we normalize here.
    const headingValue =
      typeof raw.heading === 'string' && raw.heading.length > 0
        ? raw.heading
        : typeof raw.title === 'string' && raw.title.length > 0
          ? raw.title
          : undefined
    if (headingValue === undefined) {
      throw new Error(
        `Action plan field "steps[${index}].heading" must be a non-empty string`,
      )
    }
    const pillDecisionsRaw = raw.pillDecisions
    const pillDecisions = Array.isArray(pillDecisionsRaw)
      ? pillDecisionsRaw.filter(
          (slug): slug is string => typeof slug === 'string' && allowList.has(slug),
        )
      : []
    return { id, heading: headingValue, pillDecisions }
  })

  return { title, description, badge, steps, difficulty, timeMinutes, category }
}

// ----------------------------------------------------------------------------
// Internals
// ----------------------------------------------------------------------------

function stripCodeFences(text: string): string {
  // Handles ```json ... ``` and plain ``` ... ``` wrappers.
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/m)
  return fenceMatch ? fenceMatch[1] : text
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Action plan field "${field}" must be a non-empty string`)
  }
  return value
}
