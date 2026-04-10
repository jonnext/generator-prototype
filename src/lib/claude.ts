// Claude fetch wrapper — talks to /api/claude which the Vercel serverless
// function proxies to https://api.anthropic.com/v1/messages.
//
// Two modes:
//   - callClaude()    — non-streaming JSON response (used for Action Plan
//                       generation where we need the full object at once
//                       to seed the step cards)
//   - streamClaude()  — SSE streaming, yields text deltas one at a time
//                       (used for step body generation and inpainting where
//                       progressive rendering is the whole point)
//
// Both mode support AbortController so the ChatTray's interrupt path can
// cancel in-flight requests cleanly.
//
// No @anthropic-ai/sdk dependency — the proxy handles auth and we only
// need the thin text-delta path, so shipping the full SDK to the client
// would be bundle weight for no benefit.

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ClaudeRequest {
  /** Claude model id. Defaults to the latest Opus for quality. */
  model?: string
  /** Max output tokens. Defaults to 2048 which covers all our prompts. */
  maxTokens?: number
  /** System prompt. Sent as the top-level `system` param, not as a message. */
  system?: string
  /** Conversation turns. Must alternate user/assistant/user/... */
  messages: ClaudeMessage[]
  /** AbortSignal from the caller for interrupt support. */
  signal?: AbortSignal
}

const DEFAULT_MODEL = 'claude-opus-4-6'
const DEFAULT_MAX_TOKENS = 2048
const PROXY_URL = '/api/claude'

// ----------------------------------------------------------------------------
// Non-streaming call — returns the full assistant text block.
// ----------------------------------------------------------------------------

export async function callClaude(req: ClaudeRequest): Promise<string> {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: req.signal,
    body: JSON.stringify({
      model: req.model ?? DEFAULT_MODEL,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: req.system,
      messages: req.messages,
      stream: false,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Claude call failed: ${response.status} ${body}`)
  }

  const json = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>
  }

  // Anthropic returns content as an array of typed blocks; the text blocks
  // are the ones we care about. Join them in order.
  const text = (json.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('')

  return text
}

// ----------------------------------------------------------------------------
// Streaming call — yields text deltas via async iterator.
// ----------------------------------------------------------------------------
//
// The proxy passes the upstream SSE body through verbatim, so the shape
// is Anthropic's standard stream:
//
//   event: message_start
//   event: content_block_start
//   event: content_block_delta  { "type": "content_block_delta",
//                                  "delta": { "type": "text_delta",
//                                             "text": "Hello " } }
//   event: content_block_stop
//   event: message_stop
//
// We only care about content_block_delta frames — everything else is
// skipped. An abort signal from the caller cancels the fetch and the
// iterator stops cleanly.

export async function* streamClaude(
  req: ClaudeRequest,
): AsyncGenerator<string, void, unknown> {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: req.signal,
    body: JSON.stringify({
      model: req.model ?? DEFAULT_MODEL,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: req.system,
      messages: req.messages,
      stream: true,
    }),
  })

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '')
    throw new Error(`Claude stream failed: ${response.status} ${body}`)
  }

  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .getReader()

  // SSE frames are separated by \n\n. We buffer partial frames across
  // reads because a TCP chunk boundary can fall inside a frame.
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value

      let frameEnd = buffer.indexOf('\n\n')
      while (frameEnd !== -1) {
        const frame = buffer.slice(0, frameEnd)
        buffer = buffer.slice(frameEnd + 2)

        const delta = parseContentBlockDelta(frame)
        if (delta !== null) yield delta

        frameEnd = buffer.indexOf('\n\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ----------------------------------------------------------------------------
// Parse one SSE frame, return the text delta or null.
// Frame format:
//   event: content_block_delta
//   data: { "type":"content_block_delta", "delta":{"type":"text_delta","text":"..."} }
// ----------------------------------------------------------------------------

function parseContentBlockDelta(frame: string): string | null {
  // Fast path: only content_block_delta frames carry text we need.
  if (!frame.includes('content_block_delta')) return null

  // Find the data: line. Each SSE frame has one `event:` + one `data:`.
  const dataLineStart = frame.indexOf('data:')
  if (dataLineStart === -1) return null

  const jsonStart = frame.indexOf('{', dataLineStart)
  if (jsonStart === -1) return null

  // Remainder of the frame from the JSON start to the end is our payload.
  const jsonText = frame.slice(jsonStart).trim()

  try {
    const parsed = JSON.parse(jsonText) as {
      type?: string
      delta?: { type?: string; text?: string }
    }
    if (
      parsed.type === 'content_block_delta' &&
      parsed.delta?.type === 'text_delta' &&
      typeof parsed.delta.text === 'string'
    ) {
      return parsed.delta.text
    }
  } catch {
    // Malformed frame — skip silently. Streaming is best-effort.
  }
  return null
}
