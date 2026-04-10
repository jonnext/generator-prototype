// Vercel serverless function: proxy to Anthropic Messages API.
// Reads ANTHROPIC_API_KEY from env (already set on the jonnext/generator-prototype Vercel project).
// Ported from gen/proxy.mjs with streaming passthrough added.

export const config = {
  runtime: 'nodejs',
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
    return
  }

  // req.body arrives parsed on Vercel; stringify for upstream.
  const payload =
    typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})

  let parsed
  try {
    parsed = JSON.parse(payload)
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' })
    return
  }

  const wantsStream = parsed?.stream === true

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: payload,
    })

    if (wantsStream && upstream.body) {
      // SSE passthrough for streaming responses.
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.status(upstream.status)

      const reader = upstream.body.getReader()
      const decoder = new TextDecoder()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(decoder.decode(value, { stream: true }))
        }
      } finally {
        res.end()
      }
      return
    }

    const text = await upstream.text()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(upstream.status).send(text)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
}
