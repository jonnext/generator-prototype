// chatAck — short conversational acknowledgment that runs in parallel with
// runSkeleton when a student refines their project via the chat tray.
//
// The chat in this prototype is a refinement channel: typing a message triggers
// a full skeleton regeneration with the updated context, and the canvas updates
// with the new outline. On its own, that's architecturally correct but feels
// broken — the user types, sees their own message, and then waits 3-5 seconds
// of silence before the canvas updates. No assistant reply in the chat window.
//
// This module fixes that by firing a second, much smaller Claude call in
// parallel with runSkeleton. It asks for a 1-2 sentence acknowledgment naming
// the specific change the student asked for. It lands in ~1-2 seconds (short
// max_tokens), so the user gets responsive feedback in the chat tray while
// the full skeleton regeneration is still running in the background.
//
// Result feels like a real agentic chat: user message → assistant bubble
// streams in quickly → canvas update lands a beat later.

import { callClaude } from './claude'
import type { ChatMessage, Phase } from './state'

export interface BuildChatAckPromptInput {
  /** The message the student just sent via the chat tray. */
  userMessage: string
  /** The original intent that kicked off the current project (for context). */
  currentIntent: string
  /** The current project title (so the ack can reference it if useful). */
  currentTitle: string
  /**
   * Current generation phase. Post-DP1 the canvas always regenerates LIVE
   * during 'learning' — there is no deferred-Build state anymore — so the
   * ack copy maps cleanly to "updating the outline now".
   */
  currentPhase: Phase
  /** Recent chat history for conversational continuity. Kept to the last 3. */
  previousMessages: ChatMessage[]
}

export interface BuildChatAckPromptOutput {
  system: string
  user: string
}

export function buildChatAckPrompt(
  input: BuildChatAckPromptInput,
): BuildChatAckPromptOutput {
  // Phase-specific copy rules. Post-DP1 the canvas always regenerates LIVE
  // when chat lands, so the ack consistently reads as "updating the outline".
  //
  // - learning  → primary state. Outline regenerates live with the request.
  // - focused   → student is inside Highway on one step; chat is step-scoped.
  // - discovery / materializing → should not reach this path, but we include
  //   a sane fallback so typing doesn't crash.
  const phaseRules: Record<Phase, string> = {
    discovery:
      '- Canvas state: starting fresh. Acknowledge the request and mention the outline is coming together now.',
    materializing:
      '- Canvas state: the outline is materializing for the first time. Acknowledge the request and mention it will be reflected in the outline that is landing now.',
    learning:
      '- Canvas state: the outline is visible and the student is shaping it. The outline is regenerating NOW with this change. Acknowledge the specific change and say you are updating the outline.',
    focused:
      '- Canvas state: the student is inside Highway on one specific step. The chat input here is step-scoped — only that step refines. Acknowledge the specific change and mention the step being updated.',
  }

  const system = [
    'You are a NextWork project planning assistant. The student has just asked you to refine their project outline via a chat tray that sits alongside a canvas showing the current outline.',
    '',
    'Your job RIGHT NOW is to acknowledge their request in 1-2 short sentences, naming the specific change you are going to make. The actual outline regeneration happens in a parallel call — you are ONLY responsible for the conversational acknowledgment that appears in the chat tray.',
    '',
    'Tone rules:',
    '- Direct, evidence-based, no motivational filler.',
    '- No em dashes — use regular dashes or commas.',
    '- 1-2 sentences maximum. Anything longer is wrong.',
    '- Name the specific change the student asked for — do not hedge with "I will consider" or "let me think about it". Commit.',
    '- Do NOT write out the new outline, step headings, or content details. The canvas will show those. You are just acknowledging.',
    '- Do NOT ask clarifying questions — the skeleton regeneration handles intent on its own.',
    '',
    'Phase-specific rules (CRITICAL — the ack must match what is actually happening on the canvas):',
    phaseRules[input.currentPhase],
    '',
    'Examples (canvas IS updating):',
    '- ✅ "Got it — swapping ECS for Lambda and updating the deployment steps to match. Give me a second."',
    '- ✅ "Making it beginner-friendly: simpler commands, fewer optional flags, more checkpoints."',
    '',
    'Bad examples:',
    '- ❌ "I will consider your request and update the outline accordingly." (vague, no specific change named)',
    '- ❌ "Here is the new outline:..." (never write outline content — that belongs to the canvas)',
    '- ❌ "Are you sure you want to switch to Lambda?" (never ask — just commit)',
  ].join('\n')

  const recentMessages = input.previousMessages
    .slice(-3)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')

  const user = [
    `Current project title: ${input.currentTitle || '(untitled)'}`,
    `Original intent: ${input.currentIntent}`,
    '',
    recentMessages ? `Recent chat:\n${recentMessages}` : '',
    '',
    `Student just asked: "${input.userMessage}"`,
    '',
    'Acknowledge their request in 1-2 short sentences, naming the specific change. That is your entire output.',
  ]
    .filter((line) => line.length > 0)
    .join('\n')

  return { system, user }
}

/**
 * Fetches a short conversational acknowledgment from Claude. Uses a small
 * `max_tokens` cap (~200) because the ack is always 1-2 sentences — anything
 * longer is a prompt violation and we don't want to pay for extra tokens.
 *
 * Throws on network / API errors — callers should catch and fall back gracefully
 * (the skeleton regeneration runs in parallel, so a failed ack doesn't break
 * the canvas update).
 */
export async function fetchChatAck(
  input: BuildChatAckPromptInput,
  signal?: AbortSignal,
): Promise<string> {
  const { system, user } = buildChatAckPrompt(input)
  const raw = await callClaude({
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: 200,
    signal,
  })
  return raw.trim()
}
