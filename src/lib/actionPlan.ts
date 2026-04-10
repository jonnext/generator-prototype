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

import type { PersonalPills } from './state'
import { modes } from './copy'

// ----------------------------------------------------------------------------
// Parsed shape Claude returns. Narrower than ActionPlan — no step bodies,
// no inpainting state, no isComplete. Pills contain only the decisionType
// slug; the UI fills selected/aiPicked as the student chooses.
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
}

export interface BuildActionPlanPromptOutput {
  system: string
  user: string
}

export function buildActionPlanPrompt(
  input: BuildActionPlanPromptInput,
): BuildActionPlanPromptOutput {
  const { intent, personal } = input
  const mode = modes.find((m) => m.id === personal.mode) ?? modes[1]

  const system = [
    'You are the NextWork project shaper. You help students who are learning to ship real cloud projects on AWS.',
    '',
    'Your job right now is to sketch a project SKELETON, not the full build. The skeleton is a short, scannable outline that the student can immediately shape by swapping choices before any step is written in detail.',
    '',
    'Tone rules (these matter, the UI treats violations as errors):',
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
  ].join('\n')

  const user = [
    `Student intent: ${intent}`,
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
    const heading = asString(raw.heading, `steps[${index}].heading`)
    const pillDecisionsRaw = raw.pillDecisions
    const pillDecisions = Array.isArray(pillDecisionsRaw)
      ? pillDecisionsRaw.filter(
          (slug): slug is string => typeof slug === 'string' && allowList.has(slug),
        )
      : []
    return { id, heading, pillDecisions }
  })

  return { title, description, badge, steps }
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
