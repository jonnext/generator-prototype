// Inpainting prompt builders.
//
// Two prompt shapes live here:
//
//   1. buildStepBodyPrompt()       — the "initial write" for a step body once
//                                    the student has finalized their pill
//                                    choices. Streams in so the UI can render
//                                    text as it arrives.
//
//   2. buildInpaintingPrompt()     — step-level regenerate actions (simplify,
//                                    extend, rewrite, regenerate). Carries
//                                    the FULL Action Plan as context so a
//                                    rewrite of Step 2 doesn't contradict the
//                                    pill choices on Steps 1 or 3.
//
// The word "inpainting" comes from image generation — we're asking Claude
// to rewrite one region of a larger composition while keeping the rest
// coherent. Same idea here: the step being regenerated sits inside a plan
// the student has already shaped, and Claude must honour the surrounding
// context rather than trying to rewrite the whole plan.
//
// Both builders return { system, user } so callers can pass the result
// straight to streamClaude() from claude.ts.

import type { ActionPlan, InpaintingAction, Step, PersonalPills } from './state'
import { modes, rationales } from './copy'

// ----------------------------------------------------------------------------
// Shared pieces
// ----------------------------------------------------------------------------

function formatPersonal(personal: PersonalPills): string {
  const mode = modes.find((m) => m.id === personal.mode) ?? modes[1]
  return [
    `Duration: ${personal.duration}`,
    `Mode: ${mode.name} (${mode.description})`,
    `Budget: ${personal.budget}`,
  ].join('\n')
}

function formatStepContext(step: Step): string {
  const pillLines = step.pills.map((pill) => {
    const rationale = rationales[pill.decisionType]
    const selected = pill.selected ?? rationale?.picked ?? '(not chosen)'
    const aiPicked = pill.aiPicked ? ' (AI chose)' : ''
    return `- ${pill.decisionType}: ${selected}${aiPicked}`
  })
  return pillLines.length === 0
    ? '(no pill decisions on this step)'
    : pillLines.join('\n')
}

function formatPlanContext(plan: ActionPlan, focusedStepId: string): string {
  return plan.steps
    .map((step, index) => {
      const isFocus = step.id === focusedStepId
      const marker = isFocus ? '>>>' : '   '
      const pillSummary = step.pills
        .filter((p) => p.selected !== null)
        .map((p) => `${p.decisionType}=${p.selected}`)
        .join(', ')
      const tail = pillSummary.length > 0 ? ` [${pillSummary}]` : ''
      return `${marker} Step ${index + 1}: ${step.heading}${tail}`
    })
    .join('\n')
}

// Tone rules repeated in both system prompts. Kept as a single constant so
// the copy-writer teammate only has to edit one spot if the voice shifts.
const TONE_RULES = [
  'Tone rules (strict — the UI treats violations as errors):',
  '- Evidence-based, direct, educational. No motivational filler.',
  '- No em dashes. Use regular dashes or commas.',
  '- No "exciting", no "let\'s dive in", no "journey".',
  '- Second person: address the student as "you".',
  '- Short paragraphs. 2-4 sentences each.',
].join('\n')

// ----------------------------------------------------------------------------
// buildStepBodyPrompt — initial write for one step's body
// ----------------------------------------------------------------------------

export interface BuildStepBodyPromptInput {
  plan: ActionPlan
  step: Step
  personal: PersonalPills
  intent: string
}

export interface PromptOutput {
  system: string
  user: string
}

export function buildStepBodyPrompt(
  input: BuildStepBodyPromptInput,
): PromptOutput {
  const { plan, step, personal, intent } = input

  const system = [
    'You are the NextWork project shaper, writing the body of a single step inside a larger cloud project outline.',
    '',
    'You must honour the surrounding plan and the pill decisions the student has already made on this step. Do not rewrite the step heading. Do not introduce tools or services that contradict the pill choices.',
    '',
    TONE_RULES,
    '',
    'Output rules:',
    '- Return plain prose only. No headings, no bullet lists unless the step truly needs them.',
    '- 2 to 4 short paragraphs total.',
    '- Reference the chosen tools by name so the student can ground the instructions.',
    '- Do not include a closing summary or "now you have..." sentence.',
  ].join('\n')

  const user = [
    `Student intent: ${intent}`,
    '',
    'Personal shape:',
    formatPersonal(personal),
    '',
    'Full plan (current step marked with >>>):',
    formatPlanContext(plan, step.id),
    '',
    `Write the body for step: ${step.heading}`,
    '',
    'Decisions locked on this step:',
    formatStepContext(step),
  ].join('\n')

  return { system, user }
}

// ----------------------------------------------------------------------------
// buildInpaintingPrompt — step-level regenerate action
// ----------------------------------------------------------------------------

export interface BuildInpaintingPromptInput {
  plan: ActionPlan
  step: Step
  action: Exclude<InpaintingAction, null>
  personal: PersonalPills
  intent: string
}

/**
 * Action-specific instructions injected into the system prompt. Each one
 * names the transform plainly so Claude knows whether to shorten, lengthen,
 * rephrase, or rewrite from scratch.
 */
const ACTION_INSTRUCTIONS: Record<Exclude<InpaintingAction, null>, string> = {
  simplify:
    'Shorten the body by roughly half. Drop the nice-to-know context and keep only the steps the student must take. Same tools, same decisions, fewer words.',
  extend:
    'Add one more short paragraph that covers the most common way this step goes wrong and how to spot it. Do not rewrite the existing paragraphs.',
  rewrite:
    'Rewrite the body from scratch in a different shape. Keep the same tools and pill decisions but vary the structure. If the previous version led with commands, lead with context this time (or vice versa).',
  regenerate:
    'Discard the previous body entirely and write a fresh version. Honour the pill decisions but make no attempt to match the phrasing of the previous attempt.',
}

export function buildInpaintingPrompt(
  input: BuildInpaintingPromptInput,
): PromptOutput {
  const { plan, step, action, personal, intent } = input

  const system = [
    'You are the NextWork project shaper, regenerating the body of a single step inside a larger cloud project outline.',
    '',
    'The student has asked for this specific transform:',
    ACTION_INSTRUCTIONS[action],
    '',
    'You must keep the rest of the plan coherent. Do not reference steps or choices that do not appear in the plan context below. Do not propose swapping tools — the pill decisions are locked.',
    '',
    TONE_RULES,
    '',
    'Output rules:',
    '- Return plain prose only. No headings. No meta commentary like "here is the rewritten step".',
    '- Do not repeat the step heading in the body.',
  ].join('\n')

  const user = [
    `Student intent: ${intent}`,
    '',
    'Personal shape:',
    formatPersonal(personal),
    '',
    'Full plan (step being regenerated marked with >>>):',
    formatPlanContext(plan, step.id),
    '',
    `Step to regenerate: ${step.heading}`,
    '',
    'Decisions locked on this step:',
    formatStepContext(step),
    '',
    'Previous body (for reference — transform per the action, do not just echo):',
    step.body.length > 0 ? step.body : '(no previous body — treat this as a first write)',
  ].join('\n')

  return { system, user }
}
