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
