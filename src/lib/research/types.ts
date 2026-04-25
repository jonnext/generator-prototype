// Research finding types — DP1.5.C.
//
// Uniform shape returned by all four tool adapters (exa, perplexity,
// firecrawl, context7). Each adapter normalizes its source-specific response
// into this shape so the orchestrator (DP1.5.E) and the research store
// (DP1.5.D) can treat findings uniformly.
//
// Kept in its own file (rather than inside state.ts) because research types
// are orthogonal to the shaping engine's ActionPlan/Step types and will
// grow over time (significance, freshness, branch-candidate metadata) as
// DP1.5.I-J land.

export type ResearchSource = 'exa' | 'perplexity' | 'firecrawl' | 'context7'

export type ResearchFindingStatus = 'pending' | 'ready' | 'failed'

export type ResearchSignificance = 'normal' | 'branch-candidate'

/**
 * Where a finding has been rendered in the UI. Tracked so the renderer can
 * avoid re-surfacing the same finding (e.g. if a branch-candidate was
 * already shown as a chip and dismissed, don't promote it again on the
 * next orchestrator pass). Populated by the markFindingSurfaced action in
 * the research store slice (DP1.5.D).
 */
export type SurfacedAs = 'pill' | 'chip' | 'block-context'

/**
 * A single piece of surfaced information from a research tool. One finding
 * wraps N snippets (e.g. Exa returns 5 URLs per call, each is a snippet).
 */
export interface ResearchSnippet {
  title: string
  url?: string
  /** The extracted text content. Length varies by source (Exa ~800 chars,
   *  Perplexity the full synthesis, Firecrawl can be page-length). */
  content: string
  /** 0-1 relevance score. Best-effort; 0.5 if source doesn't provide. */
  relevance: number
}

export interface ResearchFinding {
  id: string
  source: ResearchSource
  /** The query string that produced this finding (or the URL for Firecrawl
   *  scrape calls). Used for dedup in the orchestrator's sliding window. */
  query: string
  snippets: ResearchSnippet[]
  /** ms since epoch — set by the adapter on return. */
  timestamp: number
  /** Step IDs this finding is relevant to. Adapter returns an empty array;
   *  the orchestrator (DP1.5.E) fills this in based on which step triggered
   *  the research call. */
  relatedStepIds: string[]
  status: ResearchFindingStatus
  /** Set on status === 'failed'. Human-readable reason from the adapter. */
  error?: string
  /** Flagged by the orchestrator's branch-candidate heuristic (DP1.5.J).
   *  Adapters always return undefined here — only the orchestrator writes. */
  significance?: ResearchSignificance
  /**
   * Firecrawl-only: tags findings as `freshness: high` so the section
   * generator prompt can prefer them over stale training-data knowledge.
   * Other sources are `unknown`. Set by the adapter.
   */
  freshness?: 'high' | 'unknown'
  /**
   * Where the finding has been rendered in the UI. Set by the renderer via
   * markFindingSurfaced once it's been shown. Undefined until surfaced.
   */
  surfacedAs?: SurfacedAs
}

export interface ResearchCallOpts {
  /** Caller's abort signal. Composed with the adapter's internal timeout. */
  signal?: AbortSignal
  /** Pre-populates relatedStepIds on the returned finding. The orchestrator
   *  passes this so callers don't need a separate wiring step. */
  relatedStepIds?: string[]
  /** Override the adapter's default timeout. Defaults: 6s for discovery
   *  tools, 8s for Firecrawl scrape (page reads are slower). */
  timeoutMs?: number
}

// ----------------------------------------------------------------------------
// Shared helpers used by all four adapters
// ----------------------------------------------------------------------------

/**
 * Compose an external signal with a timeout so the adapter returns a
 * graceful-fail finding rather than leaving the Promise hanging.
 *
 * Returns a new AbortController whose signal aborts when either the
 * caller's signal aborts OR the timeout fires. Also returns a cleanup to
 * clear the timeout in the happy path.
 */
export function composeSignal(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const onAbort = () => controller.abort()

  const timer = setTimeout(() => {
    controller.abort(new DOMException('timeout', 'TimeoutError'))
  }, timeoutMs)

  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', onAbort, { once: true })
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      if (external) external.removeEventListener('abort', onAbort)
    },
  }
}

/** Standard "research call failed" finding returned on timeout/error. */
export function failedFinding(
  source: ResearchSource,
  query: string,
  error: string,
  relatedStepIds: string[] = [],
): ResearchFinding {
  return {
    id: crypto.randomUUID(),
    source,
    query,
    snippets: [],
    timestamp: Date.now(),
    relatedStepIds,
    status: 'failed',
    error,
  }
}

/** Readable reason for adapter errors. Collapses timeout vs network vs HTTP. */
export function errorReason(err: unknown): string {
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return 'timeout'
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'aborted'
  }
  if (err instanceof Error) return err.message
  return String(err)
}
