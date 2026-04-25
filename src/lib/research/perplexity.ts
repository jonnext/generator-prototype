// Perplexity research adapter — DP1.5.C.
//
// Wraps the server-side Perplexity tool (api/_lib/tools/perplexity.js,
// already wired for RP1) in the uniform ResearchFinding shape. Unlike Exa
// (which returns ranked snippets), Perplexity returns a single synthesis
// paragraph + a citation list. We model the synthesis as ONE snippet and
// emit the citations as URL-only snippets with empty content so the
// orchestrator can hand them to Firecrawl's Stage 2 scrape.
//
// Perplexity is a Stage 1 tool — typical latency ~1-2s. The `sonar` model
// is cheap and fast; the prompt template on the server asks for concise
// cited answers with cost figures and GitHub-issue awareness.

import {
  composeSignal,
  errorReason,
  failedFinding,
  type ResearchCallOpts,
  type ResearchFinding,
  type ResearchSnippet,
} from './types'

interface PerplexityServerResponse {
  ok: boolean
  data?: {
    synthesis: string
    citations: string[]
  }
  error?: string
  latencyMs: number
}

export async function runPerplexityAsk(
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
      body: JSON.stringify({ tool: 'perplexity', query }),
    })

    if (!response.ok) {
      return failedFinding(
        'perplexity',
        query,
        `Perplexity HTTP ${response.status}`,
        relatedStepIds,
      )
    }

    const body = (await response.json()) as PerplexityServerResponse
    if (!body.ok || !body.data) {
      return failedFinding(
        'perplexity',
        query,
        body.error ?? 'Perplexity returned no data',
        relatedStepIds,
      )
    }

    const snippets: ResearchSnippet[] = []

    // The synthesis is the primary finding — highest relevance, full content.
    if (body.data.synthesis && body.data.synthesis.trim().length > 0) {
      snippets.push({
        title: `Perplexity synthesis for "${query.slice(0, 80)}"`,
        content: body.data.synthesis,
        relevance: 1,
      })
    }

    // Citations become URL-only snippets so the orchestrator can hand them
    // to Firecrawl. Empty content signals "needs scraping for the real text".
    for (const [i, citation] of body.data.citations.entries()) {
      if (typeof citation !== 'string' || citation.length === 0) continue
      snippets.push({
        title: `Citation ${i + 1}`,
        url: citation,
        content: '',
        // Citations carry the synthesis's implicit relevance — rank-decayed.
        relevance: Math.max(0.3, 0.9 - i * 0.1),
      })
    }

    return {
      id: crypto.randomUUID(),
      source: 'perplexity',
      query,
      snippets,
      timestamp: Date.now(),
      relatedStepIds,
      status: 'ready',
    }
  } catch (err) {
    return failedFinding('perplexity', query, errorReason(err), relatedStepIds)
  } finally {
    cleanup()
  }
}
