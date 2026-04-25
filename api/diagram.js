// /api/diagram — Phase D architecture diagram generator (DP1.6.B, 2026-04-25).
//
// Pulls together api/_lib/diagram/{prompt,gemini}.js to convert a project
// concept into a Visualize Value architecture image. Mirrors the shape of
// api/research-tool.js (POST-only, OPTIONS pre-flight, IP-keyed rate limit)
// so it slots into the same Vercel + dev-proxy plumbing.
//
// Request body:
//   {
//     title: string,                          // required
//     description?: string,                   // optional
//     steps?: Array<{ heading: string }>,     // optional, used as components
//     aspectRatio?: '16:9' | '4:3' | '1:1',   // defaults to '16:9'
//     accentId?: 'blue' | 'green' | 'orange', // defaults to 'blue'
//     background?: 'dark' | 'light',          // defaults to 'dark'
//   }
//
// Response body:
//   { ok: true, dataUrl: string, model: string, latencyMs: number }
//   { ok: false, error: string, latencyMs: number }
//
// `dataUrl` is a fully-formed `data:image/...;base64,<...>` string — the
// client can drop it straight into <img src> with zero further processing.

import { generateDiagramImage } from './_lib/diagram/gemini.js'
import { buildDiagramPrompt } from './_lib/diagram/prompt.js'

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

  try {
    const result = await dispatchDiagram(parsed)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(200).json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res
      .status(message.startsWith('Missing required field') ? 400 : 500)
      .json({ error: message })
  }
}

export async function dispatchDiagram(payload) {
  const start = Date.now()
  const title = typeof payload?.title === 'string' ? payload.title.trim() : ''
  if (!title) {
    throw new Error('Missing required field: title')
  }

  const description =
    typeof payload?.description === 'string' ? payload.description.trim() : undefined
  const steps = Array.isArray(payload?.steps) ? payload.steps : []
  const components = steps
    .map((s) => (typeof s?.heading === 'string' ? s.heading.trim() : ''))
    .filter((h) => h.length > 0)

  const aspectRatio = ['16:9', '4:3', '1:1'].includes(payload?.aspectRatio)
    ? payload.aspectRatio
    : '16:9'
  const accentId = ['blue', 'green', 'orange'].includes(payload?.accentId)
    ? payload.accentId
    : 'blue'
  const background = ['dark', 'light'].includes(payload?.background)
    ? payload.background
    : 'dark'

  const prompt = buildDiagramPrompt(
    { title, description, components },
    { accentId, background },
  )

  const result = await generateDiagramImage(prompt, aspectRatio)

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      latencyMs: result.latencyMs || Date.now() - start,
    }
  }

  const dataUrl = `data:${result.data.mimeType};base64,${result.data.base64}`
  return {
    ok: true,
    dataUrl,
    model: result.data.model,
    latencyMs: result.latencyMs || Date.now() - start,
  }
}
