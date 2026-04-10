// useClaudeStream — React hook wrapping streamClaude() from lib/claude.ts.
//
// Responsibilities:
//   - Fire a Claude stream on demand, feeding each delta to an onChunk
//     callback so the caller can append to reducer-owned state incrementally.
//   - Own an AbortController per run so callers can interrupt mid-stream via
//     stop() or by calling run() again (the previous run cancels automatically).
//   - Track status ('idle' | 'streaming' | 'done' | 'error' | 'aborted') in
//     local state for components that want to render a spinner or gate
//     follow-up actions.
//   - Expose the latest AbortController via a ref so the App root can share
//     it with the chat tray's interrupt path without triggering re-renders.
//
// Shape of the hook:
//
//   const { status, error, run, stop, abortRef } = useClaudeStream({ onChunk })
//
//   run({ system, messages })  // starts a fresh stream
//   stop()                     // aborts the current run
//
// run() returns a promise that resolves when the stream completes or rejects
// on error (abort is NOT an error — it resolves with status 'aborted' so
// callers can distinguish "user interrupted" from "network failed").
//
// Per rerender-split-combined-hooks, this hook only owns stream state. It
// does NOT know about the shaping engine, the chat tray, or which step is
// being streamed. The caller composes it with state updates in a useCallback.

import { useCallback, useRef, useState } from 'react'
import { streamClaude, type ClaudeMessage } from '@/lib/claude'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type StreamStatus = 'idle' | 'streaming' | 'done' | 'error' | 'aborted'

export interface UseClaudeStreamOptions {
  /** Called for every text delta as it arrives. Keep it cheap — it runs inside the stream loop. */
  onChunk: (chunk: string) => void
  /** Optional hook for the terminal state. Receives the full accumulated text on done, the error on error, or null on abort. */
  onSettle?: (result:
    | { status: 'done'; text: string }
    | { status: 'error'; error: Error }
    | { status: 'aborted' }
  ) => void
  /** Override the default model. */
  model?: string
  /** Override the default max_tokens. */
  maxTokens?: number
}

export interface RunClaudeStreamInput {
  system?: string
  messages: ClaudeMessage[]
}

export interface UseClaudeStreamApi {
  status: StreamStatus
  /** Error from the last failed run. Cleared on the next run(). */
  error: Error | null
  /** Kick off a new stream. Aborts any previous in-flight run first. */
  run: (input: RunClaudeStreamInput) => Promise<void>
  /** Abort the current stream, if any. Safe to call when idle. */
  stop: () => void
  /**
   * Ref to the currently active AbortController. Exposed so the App root
   * can read/write it without a re-render (e.g. the chat tray's interrupt
   * path that needs to cancel a step body stream started by a different
   * code path). Never set this directly — use run() / stop().
   */
  abortRef: React.RefObject<AbortController | null>
}

// ----------------------------------------------------------------------------
// Hook
// ----------------------------------------------------------------------------

export function useClaudeStream(
  options: UseClaudeStreamOptions,
): UseClaudeStreamApi {
  const { onChunk, onSettle, model, maxTokens } = options

  const [status, setStatus] = useState<StreamStatus>('idle')
  const [error, setError] = useState<Error | null>(null)

  // AbortController lives in a ref — it's transient interaction state per
  // rerender-use-ref-transient-values, no component reads it during render.
  const abortRef = useRef<AbortController | null>(null)

  // Latest-settle ref so a stale run() promise that finishes after a newer
  // run() started can't leak into state. Each run bumps this counter and
  // checks it before touching setState.
  const runIdRef = useRef(0)

  const stop = useCallback(() => {
    const controller = abortRef.current
    if (controller) {
      controller.abort()
      abortRef.current = null
    }
  }, [])

  const run = useCallback(
    async (input: RunClaudeStreamInput): Promise<void> => {
      // Cancel any in-flight run before starting a new one. This is the
      // "user typed during generation" path — the previous stream is now
      // irrelevant, and we want its reducer updates to stop immediately.
      if (abortRef.current) {
        abortRef.current.abort()
      }

      const controller = new AbortController()
      abortRef.current = controller
      const myRunId = ++runIdRef.current

      setStatus('streaming')
      setError(null)

      let accumulated = ''
      try {
        const iterator = streamClaude({
          model,
          maxTokens,
          system: input.system,
          messages: input.messages,
          signal: controller.signal,
        })

        for await (const chunk of iterator) {
          // If a newer run has started, bail. The newer run owns abortRef
          // and onChunk writes from this stale one would duplicate into the
          // wrong step.
          if (runIdRef.current !== myRunId) return
          accumulated += chunk
          onChunk(chunk)
        }

        if (runIdRef.current !== myRunId) return
        setStatus('done')
        abortRef.current = null
        onSettle?.({ status: 'done', text: accumulated })
      } catch (err) {
        if (runIdRef.current !== myRunId) return

        // Abort shows up as a DOMException with name 'AbortError'. Treat
        // it as a terminal non-error so callers can distinguish interrupt
        // from network failure.
        if (isAbortError(err)) {
          setStatus('aborted')
          abortRef.current = null
          onSettle?.({ status: 'aborted' })
          return
        }

        const normalized =
          err instanceof Error ? err : new Error(String(err))
        setStatus('error')
        setError(normalized)
        abortRef.current = null
        onSettle?.({ status: 'error', error: normalized })
      }
    },
    [onChunk, onSettle, model, maxTokens],
  )

  return { status, error, run, stop, abortRef }
}

// ----------------------------------------------------------------------------
// Internals
// ----------------------------------------------------------------------------

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof Error && err.name === 'AbortError') return true
  return false
}
