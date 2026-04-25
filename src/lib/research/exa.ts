// Exa research adapter — DP1.5.C.
//
// Wraps the server-side Exa tool (api/_lib/tools/exa.js, already wired for
// RP1) in the uniform ResearchFinding shape the orchestrator expects. Adds:
//   - 6s hard timeout via AbortController composition
//   - Graceful-fail on network/server errors (returns a `failed` finding
//     rather than throwing so orchestrator doesn't need try/catch)
//   - Relevance estimation from Exa's result order (Exa doesn't expose a
//     numeric score so we derive 1.0 → 0.2 by rank)
//
// Exa is a Stage 1 (discovery) tool — fast semantic search returning
// top-5 URLs + ~800 char snippets. The orchestrator surfaces these URLs
// to Firecrawl's Stage 2 scrape for deep-reading.

import {
  composeSignal,
  errorReason,
  failedFinding,
  type ResearchCallOpts,
  type ResearchFinding,
  type ResearchSnippet,
} from './types'

interface ExaServerResponse {
  ok: boolean
  data?: {
    results: Array<{
      title: string | null
      url: string | null
      snippet: string | null
      publishedDate: string | null
      author: string | null
    }>
  }
  error?: string
  latencyMs: number
}

export async function runExaSearch(
  query: string,
  opts: ResearchCallOpts = {},
): Promise<ResearchFinding> {
  const { signal, cleanup } = composeSignal(opts.signal, opts.timeoutMs ?? 6000)
  const relatedStepIds = opts.relatedStepIds ?? []

  try {
    const response = await fetch('/api/research-tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ tool: 'exa', query }),
    })

    if (!response.ok) {
      return failedFinding(
        'exa',
        query,
        `Exa HTTP ${response.status}`,
        relatedStepIds,
      )
    }

    const body = (await response.json()) as ExaServerResponse
    if (!body.ok || !body.data) {
      return failedFinding(
        'exa',
        query,
        body.error ?? 'Exa returned no data',
        relatedStepIds,
      )
    }

    const snippets: ResearchSnippet[] = body.data.results
      .filter((r) => r.url !== null && r.snippet !== null)
      .map((r, i, arr) => ({
        title: r.title ?? 'Untitled',
        url: r.url ?? undefined,
        content: r.snippet ?? '',
        // Rank-based relevance: top result 1.0, linearly decaying. Exa's
        // internal neural ranking is what produced the order, so rank is a
        // reasonable proxy when the API doesn't surface a numeric score.
        relevance: arr.length === 1 ? 1 : Math.max(0.2, 1 - i / arr.length),
      }))

    return {
      id: crypto.randomUUID(),
      source: 'exa',
      query,
      snippets,
      timestamp: Date.now(),
      relatedStepIds,
      status: 'ready',
    }
  } catch (err) {
    return failedFinding('exa', query, errorReason(err), relatedStepIds)
  } finally {
    cleanup()
  }
}
