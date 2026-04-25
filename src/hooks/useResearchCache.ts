// Session-scoped research cache.
//
// Single-entry store keyed by the trimmed intent string. One ResearchResponse
// in flight or resident at a time. Sculpt consumers (inpainting, step body
// write, skeleton regen) call awaitResearch(intent) to block-until-warm,
// satisfying the accuracy > speed mandate locked in feedback_materialization_first.md.
//
// The cache is a module-level singleton, not a hook-owned ref, so:
//   - App.tsx's async handlers get imperative access via getResearchCache()
//   - The debug panel subscribes reactively via useResearchCacheStatus()
//   - The `promise` field on warming entries is coordination plumbing that
//     must not flow through React's render cycle — ref-backed by design.

import { useSyncExternalStore } from 'react'
import { fetchResearch, type ResearchResponse } from '@/lib/research'
import { recordResearchMetric } from '@/lib/researchMetrics'

export type ResearchCacheEntry =
  | { status: 'idle' }
  | {
      status: 'warming'
      intent: string
      startedAt: number
      promise: Promise<ResearchResponse>
      controller: AbortController
    }
  | {
      status: 'ready'
      intent: string
      startedAt: number
      resolvedAt: number
      data: ResearchResponse
    }
  | {
      status: 'error'
      intent: string
      startedAt: number
      failedAt: number
      error: string
    }

type Listener = () => void

let entry: ResearchCacheEntry = { status: 'idle' }
const listeners = new Set<Listener>()

function notify(): void {
  for (const l of listeners) l()
}

function setEntry(next: ResearchCacheEntry): void {
  entry = next
  notify()
}

function normalizeIntent(intent: string): string {
  return intent.trim()
}

// Imperative API used by App.tsx handlers.
// Kept on a single object so callsites see one dependency.

export interface ResearchCache {
  prefetchResearch(intent: string, sessionId: string): void
  awaitResearch(intent: string): Promise<ResearchResponse>
  peekResearch(intent: string): ResearchCacheEntry
  getEntry(): ResearchCacheEntry
  subscribe(listener: Listener): () => void
}

export const researchCache: ResearchCache = {
  prefetchResearch(rawIntent, sessionId) {
    const intent = normalizeIntent(rawIntent)
    if (intent.length === 0) return

    // Idempotent: if we already have a ready or warming entry for this exact
    // intent, do not refire. Chat refinements pass the same intent; they
    // must hit the warm cache without burning the /api/research quota.
    if (
      (entry.status === 'ready' || entry.status === 'warming') &&
      entry.intent === intent
    ) {
      return
    }

    // Intent change: abort prior in-flight fetch so a stale payload cannot
    // resolve into the cache slot. Server-side quota still burns — the
    // rate-limit counter increments on request entry, not completion.
    if (entry.status === 'warming') {
      try {
        entry.controller.abort()
      } catch {
        // abort on an already-aborted controller throws on some runtimes; no-op.
      }
    }

    const controller = new AbortController()
    const startedAt = Date.now()

    recordResearchMetric({
      kind: 'start',
      intent,
      sessionId,
      t: startedAt,
    })

    const promise = fetchResearch(intent, {
      mode: 'full',
      sessionId,
      signal: controller.signal,
    })

    setEntry({
      status: 'warming',
      intent,
      startedAt,
      promise,
      controller,
    })

    void promise
      .then((data) => {
        // Ignore resolution if cache has moved on to a newer intent.
        if (entry.status !== 'warming' || entry.intent !== intent) {
          recordResearchMetric({
            kind: 'abort',
            intent,
            sessionId,
            t: Date.now(),
            latencyMs: Date.now() - startedAt,
          })
          return
        }
        const resolvedAt = Date.now()
        recordResearchMetric({
          kind: 'done',
          intent,
          sessionId,
          t: resolvedAt,
          latencyMs: resolvedAt - startedAt,
          ok: true,
        })
        setEntry({
          status: 'ready',
          intent,
          startedAt,
          resolvedAt,
          data,
        })
      })
      .catch((err: unknown) => {
        if (entry.status !== 'warming' || entry.intent !== intent) {
          // Superseded — fall through silently.
          return
        }
        const failedAt = Date.now()
        const message = err instanceof Error ? err.message : String(err)
        const isAbort = err instanceof Error && err.name === 'AbortError'
        recordResearchMetric({
          kind: isAbort ? 'abort' : 'done',
          intent,
          sessionId,
          t: failedAt,
          latencyMs: failedAt - startedAt,
          ok: false,
          error: message,
        })
        // An AbortError on the current entry means the caller explicitly
        // aborted without replacing the entry — rare, but treat as error
        // so consumers don't hang on a dead promise.
        setEntry({
          status: 'error',
          intent,
          startedAt,
          failedAt,
          error: message,
        })
      })
  },

  async awaitResearch(rawIntent) {
    const intent = normalizeIntent(rawIntent)

    const snapshot = entry
    if (snapshot.status === 'ready' && snapshot.intent === intent) {
      recordResearchMetric({
        kind: 'consumed',
        intent,
        sessionId: '',
        t: Date.now(),
        latencyMs: 0,
      })
      return snapshot.data
    }
    if (snapshot.status === 'warming' && snapshot.intent === intent) {
      const startWait = Date.now()
      const data = await snapshot.promise
      recordResearchMetric({
        kind: 'consumed',
        intent,
        sessionId: '',
        t: Date.now(),
        latencyMs: Date.now() - startWait,
      })
      return data
    }
    if (snapshot.status === 'error' && snapshot.intent === intent) {
      throw new Error(snapshot.error)
    }

    // No entry for this intent — consumer is running ahead of the producer
    // (e.g. test harness). Fire a fresh fetch without a session id — callers
    // that care about session routing should always prefetch first.
    throw new Error(`No research prefetch for intent: ${intent.slice(0, 60)}`)
  },

  peekResearch(rawIntent) {
    const intent = normalizeIntent(rawIntent)
    if (
      (entry.status === 'warming' ||
        entry.status === 'ready' ||
        entry.status === 'error') &&
      entry.intent !== intent
    ) {
      return { status: 'idle' }
    }
    return entry
  },

  getEntry() {
    return entry
  },

  subscribe(listener) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

// React subscription — for the debug panel only. Not used by sculpt handlers
// because their async flow should read `researchCache.getEntry()` directly
// and never re-render on cache transitions.
export function useResearchCacheStatus(): ResearchCacheEntry {
  return useSyncExternalStore(
    researchCache.subscribe,
    researchCache.getEntry,
    researchCache.getEntry,
  )
}
