// Context7 research adapter — DP1.5.C.
//
// Context7 provides live API/library documentation (React hooks, npm
// packages, SDK method signatures) via a REST API. Unlike Exa/Perplexity's
// broad semantic search, Context7 is LIBRARY-SPECIFIC — you ask it about a
// named package and it returns the current docs. This fills a gap in the
// research stack: verify that the code Claude proposes uses real APIs that
// exist today in the library's current version.
//
// Stage 1 (discovery) tool, but **conditional** — the orchestrator only
// fires Context7 when a library/SDK name is detected in the prompt or step
// heading (e.g. "React", "Next.js", "@anthropic-ai/sdk"). If there's no
// identifiable library, Context7 has nothing to answer, so the orchestrator
// skips it.
//
// If CONTEXT7_API_KEY is not configured on the proxy, the server adapter
// returns ok: false with a clear reason. The client normalizes that into a
// `status: 'failed'` finding per the plan's "flag, don't block" pragma.

import {
  composeSignal,
  errorReason,
  failedFinding,
  type ResearchCallOpts,
  type ResearchFinding,
  type ResearchSnippet,
} from './types'

interface Context7ServerResponse {
  ok: boolean
  data?: {
    library: string
    snippets: Array<{
      title: string
      url?: string
      content: string
    }>
  }
  error?: string
  latencyMs: number
}

export async function runContext7Query(
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
      body: JSON.stringify({ tool: 'context7', query }),
    })

    if (!response.ok) {
      return failedFinding(
        'context7',
        query,
        `Context7 HTTP ${response.status}`,
        relatedStepIds,
      )
    }

    const body = (await response.json()) as Context7ServerResponse
    if (!body.ok || !body.data) {
      return failedFinding(
        'context7',
        query,
        body.error ?? 'Context7 returned no data',
        relatedStepIds,
      )
    }

    const snippets: ResearchSnippet[] = body.data.snippets.map((s, i, arr) => ({
      title: s.title,
      url: s.url,
      content: s.content,
      relevance: arr.length === 1 ? 1 : Math.max(0.4, 1 - i / arr.length),
    }))

    return {
      id: crypto.randomUUID(),
      source: 'context7',
      query,
      snippets,
      timestamp: Date.now(),
      relatedStepIds,
      status: 'ready',
    }
  } catch (err) {
    return failedFinding('context7', query, errorReason(err), relatedStepIds)
  } finally {
    cleanup()
  }
}
