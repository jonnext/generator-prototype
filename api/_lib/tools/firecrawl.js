import FirecrawlApp from '@mendable/firecrawl-js'

export async function runFirecrawl(prompt) {
  const start = Date.now()
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'FIRECRAWL_API_KEY not configured', latencyMs: 0 }
  }

  try {
    const firecrawl = new FirecrawlApp({ apiKey })
    const result = await firecrawl.search(prompt, { limit: 5 })
    const latencyMs = Date.now() - start

    const items = result?.data ?? result?.web ?? []
    const normalized = items.map((item) => ({
      title: item.title ?? item.metadata?.title ?? null,
      url: item.url ?? item.link ?? null,
      snippet: item.description ?? item.markdown?.slice(0, 500) ?? null,
    }))

    return { ok: true, data: { results: normalized }, latencyMs }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    }
  }
}

// DP1.5.C — scrape a specific URL and return its live markdown. This is
// the Stage 2 "deep-read" path the orchestrator hands off URLs to after
// Stage 1 surfaces them. Unlike search (broad web query), scrape reads one
// page exactly as it stands right now — the freshness engine for topics
// like OpenClaw / Claude SDK where training data is stale.
export async function runFirecrawlScrape(url) {
  const start = Date.now()
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'FIRECRAWL_API_KEY not configured', latencyMs: 0 }
  }

  if (typeof url !== 'string' || url.length === 0) {
    return { ok: false, error: 'url must be a non-empty string', latencyMs: 0 }
  }

  try {
    const firecrawl = new FirecrawlApp({ apiKey })
    const result = await firecrawl.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,
    })
    const latencyMs = Date.now() - start

    // The SDK variant returns { markdown, metadata } either at the top level
    // or inside a `data` wrapper depending on version. Tolerate both.
    const payload = result?.data ?? result ?? {}
    const markdown =
      typeof payload.markdown === 'string' ? payload.markdown : ''
    const title =
      typeof payload.metadata?.title === 'string'
        ? payload.metadata.title
        : null

    if (markdown.length === 0) {
      return {
        ok: false,
        error: 'Firecrawl scrape returned empty markdown',
        latencyMs,
      }
    }

    return {
      ok: true,
      data: { url, title, markdown },
      latencyMs,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    }
  }
}
