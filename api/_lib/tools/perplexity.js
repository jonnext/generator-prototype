export async function runPerplexity(prompt) {
  const start = Date.now()
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'PERPLEXITY_API_KEY not configured', latencyMs: 0 }
  }

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content:
              'You are a concise research assistant. When answering, cite specific sources, surface known GitHub issues or caveats, and include cost figures where relevant.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 800,
      }),
    })

    const latencyMs = Date.now() - start

    if (!response.ok) {
      const text = await response.text()
      return {
        ok: false,
        error: `Perplexity ${response.status}: ${text.slice(0, 200)}`,
        latencyMs,
      }
    }

    const body = await response.json()
    const synthesis = body?.choices?.[0]?.message?.content ?? ''
    const citations = body?.citations ?? []
    return { ok: true, data: { synthesis, citations }, latencyMs }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    }
  }
}
