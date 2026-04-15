import { runResearch } from './_lib/research.js'

export const config = { runtime: 'nodejs' }

const WINDOW_MS = 60_000
const LIMIT = 10
const hits = new Map()

function rateLimited(ip) {
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (arr.length >= LIMIT) {
    hits.set(ip, arr)
    return true
  }
  arr.push(now)
  hits.set(ip, arr)
  return false
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

  const ip =
    (req.headers['x-forwarded-for'] ?? '').toString().split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'Rate limit exceeded (10/min)' })
    return
  }

  const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})
  let parsed
  try {
    parsed = JSON.parse(payload)
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' })
    return
  }

  const prompt = typeof parsed?.prompt === 'string' ? parsed.prompt.trim() : ''
  if (!prompt) {
    res.status(400).json({ error: 'Missing required field: prompt' })
    return
  }

  const mode = parsed?.mode === 'exa-only' ? 'exa-only' : 'full'

  try {
    const result = await runResearch(prompt, { mode })
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(200).json(result)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
}
