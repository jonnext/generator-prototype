// Firecrawl research adapter — DP1.5.C.
//
// Exposes TWO functions that map to Firecrawl's two distinct capabilities:
//
//   runFirecrawlSearch(query) — broad web search → URLs + metadata.
//     Roughly equivalent to Exa's semantic search but indexing a different
//     crawl. Stage 1 (discovery) tool. RP1 already wired this server-side.
//
//   runFirecrawlScrape(url)   — deep-read one live URL → full markdown.
//     This is Firecrawl's unique value — "eyes on the live web right now."
//     Stage 2 tool, called by the orchestrator after Stage 1 surfaces URLs
//     worth reading. Critical for freshness-critical topics (OpenClaw, SDKs,
//     bleeding-edge frameworks) where LLM training data is stale.
//
// Findings from Firecrawl scrape are tagged `freshness: 'high'` so the
// section-generator prompt (DP1.5.B) prefers them over training knowledge
// when content conflicts.

import {
  composeSignal,
  errorReason,
  failedFinding,
  type ResearchCallOpts,
  type ResearchFinding,
  type ResearchSnippet,
} from './types'

interface FirecrawlSearchResponse {
  ok: boolean
  data?: {
    results: Array<{
      title: string | null
      url: string | null
      snippet: string | null
    }>
  }
  error?: string
  latencyMs: number
}

interface FirecrawlScrapeResponse {
  ok: boolean
  data?: {
    url: string
    title: string | null
    markdown: string
  }
  error?: string
  latencyMs: number
}

export async function runFirecrawlSearch(
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
      body: JSON.stringify({ tool: 'firecrawl-search', query }),
    })

    if (!response.ok) {
      return failedFinding(
        'firecrawl',
        query,
        `Firecrawl search HTTP ${response.status}`,
        relatedStepIds,
      )
    }

    const body = (await response.json()) as FirecrawlSearchResponse
    if (!body.ok || !body.data) {
      return failedFinding(
        'firecrawl',
        query,
        body.error ?? 'Firecrawl search returned no data',
        relatedStepIds,
      )
    }

    const snippets: ResearchSnippet[] = body.data.results
      .filter((r) => r.url !== null)
      .map((r, i, arr) => ({
        title: r.title ?? 'Untitled',
        url: r.url ?? undefined,
        content: r.snippet ?? '',
        relevance: arr.length === 1 ? 1 : Math.max(0.2, 1 - i / arr.length),
      }))

    return {
      id: crypto.randomUUID(),
      source: 'firecrawl',
      query,
      snippets,
      timestamp: Date.now(),
      relatedStepIds,
      status: 'ready',
      // Search results are NOT freshness-high — they're just URLs. Only
      // scrape results get freshness: 'high' because the scrape is what
      // actually reads the live page.
      freshness: 'unknown',
    }
  } catch (err) {
    return failedFinding('firecrawl', query, errorReason(err), relatedStepIds)
  } finally {
    cleanup()
  }
}

export async function runFirecrawlScrape(
  url: string,
  opts: ResearchCallOpts = {},
): Promise<ResearchFinding> {
  // Scrape takes longer than search — default timeout bumped to 8s to give
  // slower pages a chance. Callers can tighten via opts.timeoutMs.
  const { signal, cleanup } = composeSignal(opts.signal, opts.timeoutMs ?? 8000)
  const relatedStepIds = opts.relatedStepIds ?? []

  try {
    const response = await fetch('/api/research-tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ tool: 'firecrawl-scrape', url }),
    })

    if (!response.ok) {
      return failedFinding(
        'firecrawl',
        url,
        `Firecrawl scrape HTTP ${response.status}`,
        relatedStepIds,
      )
    }

    const body = (await response.json()) as FirecrawlScrapeResponse
    if (!body.ok || !body.data) {
      return failedFinding(
        'firecrawl',
        url,
        body.error ?? 'Firecrawl scrape returned no data',
        relatedStepIds,
      )
    }

    const snippets: ResearchSnippet[] = [
      {
        title: body.data.title ?? body.data.url,
        url: body.data.url,
        content: body.data.markdown,
        // Scrape is the highest-authority signal available — it's the live
        // page. Top relevance so downstream ranking prefers it.
        relevance: 1,
      },
    ]

    return {
      id: crypto.randomUUID(),
      source: 'firecrawl',
      query: url,
      snippets,
      timestamp: Date.now(),
      relatedStepIds,
      status: 'ready',
      freshness: 'high',
    }
  } catch (err) {
    return failedFinding('firecrawl', url, errorReason(err), relatedStepIds)
  } finally {
    cleanup()
  }
}
