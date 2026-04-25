// /api/research-tool — per-tool research dispatch for DP1.5.C onward.
//
// Unlike /api/research (Stage 1 fan-out, RP1-era), this endpoint runs ONE
// tool at a time. The orchestrator (DP1.5.E) uses it to sequence Stage 1
// discovery calls and Stage 2 Firecrawl scrapes with per-tool visibility
// into timing, freshness, and failure reasons.
//
// Request body (always POST, always JSON):
//   { tool: 'exa' | 'perplexity' | 'firecrawl-search' | 'firecrawl-scrape' | 'context7',
//     query?: string,   // required for exa/perplexity/firecrawl-search/context7
//     url?: string }    // required for firecrawl-scrape
//
// Response body mirrors the tool's internal return: { ok, data?, error?, latencyMs }.
//
// Deployed as a Vercel serverless function in production. Mirrored in
// dev-proxy.mjs for local `npm run proxy`.

import { runExa } from './_lib/tools/exa.js'
import { runPerplexity } from './_lib/tools/perplexity.js'
import { runFirecrawl, runFirecrawlScrape } from './_lib/tools/firecrawl.js'
import { runContext7 } from './_lib/tools/context7.js'

export const config = { runtime: 'nodejs' }

const WINDOW_MS = 60_000
const LIMIT = 30
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
    res.status(429).json({ error: 'Rate limit exceeded (30/min)' })
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

  const tool = typeof parsed?.tool === 'string' ? parsed.tool : null
  if (tool === null) {
    res.status(400).json({ error: 'Missing required field: tool' })
    return
  }

  try {
    const result = await dispatchTool(tool, parsed)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(200).json(result)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
}

export async function dispatchTool(tool, payload) {
  switch (tool) {
    case 'exa':
      return requireString(payload.query, 'query').then(runExa)
    case 'perplexity':
      return requireString(payload.query, 'query').then(runPerplexity)
    case 'firecrawl-search':
      return requireString(payload.query, 'query').then(runFirecrawl)
    case 'firecrawl-scrape':
      return requireString(payload.url, 'url').then(runFirecrawlScrape)
    case 'context7':
      return requireString(payload.query, 'query').then(runContext7)
    default:
      return {
        ok: false,
        error: `Unknown tool "${tool}". Expected one of exa | perplexity | firecrawl-search | firecrawl-scrape | context7.`,
        latencyMs: 0,
      }
  }
}

async function requireString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required field: ${field}`)
  }
  return value
}
