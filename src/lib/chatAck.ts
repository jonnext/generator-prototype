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
   * Current generation phase. Gap #2 phase-aware gating means the canvas
   * regeneration is DEFERRED during 'build' / 'generating' and runs live
   * during 'sculpting' / 'complete'. The ack copy must match that reality
   * so a deferred request reads as a promise, not a lie.
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
  // Phase-specific copy rules. The ack is the ONLY visible response the
  // student gets until the canvas updates (or doesn't), so it needs to
  // accurately reflect whether the canvas is regenerating right now.
  //
  // - build / generating → regeneration is DEFERRED (the current stream keeps
  //   running). The ack names the change and says it'll apply on the next
  //   Build tap.
  // - complete           → regeneration is LIVE but existing step content
  //   stays visible while new pills / structure land. The ack can name the
  //   change and note that the canvas is updating.
  // - sculpting          → regeneration is LIVE and there are no bodies to
  //   preserve yet, so the ack is simply "updating the outline".
  // - discovery / materializing → should not reach this path, but we include
  //   a sane fallback so typing doesn't crash.
  const phaseRules: Record<Phase, string> = {
    discovery:
      '- Canvas state: starting fresh. Acknowledge the request and mention the outline is coming together now.',
    materializing:
      '- Canvas state: the outline is materializing for the first time. Acknowledge the request and mention it will be reflected in the outline that is landing now.',
    sculpting:
      '- Canvas state: the outline is visible but bodies have not been written yet. The outline is regenerating NOW with this change. Acknowledge the specific change and say you are updating the outline.',
    build:
      '- Canvas state: step bodies are actively being written. The change is DEFERRED — the current build continues uninterrupted. Acknowledge the specific change and explicitly say it will apply on the next Build tap. Do not imply the canvas is updating right now, because it is not. Example: "Got it — I will update the deployment target to EC2 when you tap Build next."',
    generating:
      '- Canvas state: step bodies are actively streaming in. The change is DEFERRED — the in-flight stream continues uninterrupted. Acknowledge the specific change and explicitly say it will apply on the next Build tap. Do not imply the canvas is updating right now, because it is not. Example: "Noted — I will tighten step 3 for beginners when you tap Build next."',
    complete:
      '- Canvas state: generation is complete. Pill choices and structure are regenerating NOW, and existing step content stays visible through the update. Acknowledge the specific change and mention that the existing content stays on screen while pills update.',
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
    'Examples (sculpting / complete — canvas IS updating):',
    '- ✅ "Got it — swapping ECS for Lambda and updating the deployment steps to match. Give me a second."',
    '- ✅ "Making it beginner-friendly: simpler commands, fewer optional flags, more checkpoints."',
    '',
    'Examples (build / generating — canvas is NOT updating right now):',
    '- ✅ "Got it — I will switch the deployment target to EC2 when you tap Build next."',
    '- ✅ "Noted — step 3 will get more beginner-friendly on the next Build."',
    '',
    'Bad examples (any phase):',
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
