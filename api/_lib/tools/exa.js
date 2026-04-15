import Exa from 'exa-js'

export async function runExa(prompt) {
  const start = Date.now()
  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'EXA_API_KEY not configured', latencyMs: 0 }
  }

  try {
    const exa = new Exa(apiKey)
    const result = await exa.searchAndContents(prompt, {
      numResults: 5,
      type: 'neural',
      text: { maxCharacters: 800 },
    })
    const latencyMs = Date.now() - start
    const results = (result?.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.text,
      publishedDate: r.publishedDate ?? null,
      author: r.author ?? null,
    }))
    return { ok: true, data: { results }, latencyMs }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    }
  }
}
