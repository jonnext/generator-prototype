// dev-proxy.mjs — Local dev proxy for generator-v2.
//
// Routes:
//   POST /                  → Anthropic Messages API passthrough (mirrors api/claude.js)
//                             The Vite dev proxy rewrites /api/claude → / on this port.
//   POST /api/research      → research stack fan-out (Exa + Perplexity + Firecrawl)
//                             The Vite dev proxy forwards /api/research verbatim.
//
// Loads ./.env on startup for any vars not already in process.env.
//
// Run:
//   npm run proxy

import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { runResearch } from './api/_lib/research.js'

loadDotEnv('./.env')

const PORT = 3456

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const url = (req.url ?? '/').split('?')[0]

  if (url === '/api/research') {
    await handleResearch(req, res)
    return
  }

  await handleClaude(req, res)
}).listen(PORT, () => {
  console.log('')
  console.log(`  ✓  Generator v2 dev proxy on http://localhost:${PORT}`)
  console.log(`     POST /               → Anthropic Messages API${process.env.ANTHROPIC_API_KEY ? '' : ' (⚠ ANTHROPIC_API_KEY missing)'}`)
  console.log(`     POST /api/research   → research stack (Exa + Perplexity + Firecrawl)`)
  const haveResearch =
    !!process.env.EXA_API_KEY && !!process.env.PERPLEXITY_API_KEY && !!process.env.FIRECRAWL_API_KEY
  if (!haveResearch) {
    console.log('')
    console.log('     ⚠  Research stack keys missing — /api/research will return per-tool errors.')
    console.log('        Add EXA_API_KEY, PERPLEXITY_API_KEY, FIRECRAWL_API_KEY to ./.env')
  }
  console.log('')
})

async function handleClaude(req, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured on proxy' }))
    return
  }

  let body = ''
  for await (const chunk of req) body += chunk

  let wantsStream = false
  try {
    const parsed = JSON.parse(body)
    wantsStream = parsed?.stream === true
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid JSON body' }))
    return
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body,
    })

    if (wantsStream && upstream.body) {
      res.writeHead(upstream.status, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })
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
    res.writeHead(upstream.status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(text)
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
  }
}

async function handleResearch(req, res) {
  let body = ''
  for await (const chunk of req) body += chunk

  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid JSON body' }))
    return
  }

  const prompt = typeof parsed?.prompt === 'string' ? parsed.prompt.trim() : ''
  if (!prompt) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing required field: prompt' }))
    return
  }

  const mode = parsed?.mode === 'exa-only' ? 'exa-only' : 'full'

  try {
    const result = await runResearch(prompt, { mode })
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(JSON.stringify(result))
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
  }
}

function loadDotEnv(path) {
  if (!existsSync(path)) return
  const raw = readFileSync(path, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key && !(key in process.env)) {
      process.env[key] = value
    }
  }
}
