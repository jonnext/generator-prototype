// scripts/smoke-test-diagram.mjs — DD.A smoke test (2026-04-25).
//
// Hits Gemini directly via the new api/_lib/diagram/gemini.js + prompt.js to
// confirm GEMINI_API_KEY plumbing works before wiring the /api/diagram
// endpoint. Loads ./.env so it picks up the same key dev-proxy.mjs will.
//
// Usage:
//   node scripts/smoke-test-diagram.mjs
//
// On success: writes the generated image to /tmp/smoke-test-diagram.png and
// prints model + latency. On failure: prints the error from gemini.js.

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { generateDiagramImage } from '../api/_lib/diagram/gemini.js'
import { buildDiagramPrompt } from '../api/_lib/diagram/prompt.js'

// Mini dotenv loader — same shape as dev-proxy.mjs uses.
function loadDotEnv(path) {
  if (!existsSync(path)) return
  const lines = readFileSync(path, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

loadDotEnv('./.env')

if (!process.env.GEMINI_API_KEY) {
  console.error('✗ GEMINI_API_KEY missing from ./.env')
  console.error('  Add it (sourced from image-generator/.env.local) and re-run.')
  process.exit(1)
}

const concept = {
  title: 'Containerised Note-Taking API',
  description: 'A small REST API behind Docker, persisting notes to a Postgres database.',
  components: ['Docker container', 'Express API', 'Postgres database', 'CLI client'],
}

const prompt = buildDiagramPrompt(concept, { accentId: 'blue', background: 'dark' })

console.log('→ Calling Gemini with concept:', concept.title)
console.log('  Aspect ratio: 16:9')
console.log('  Prompt length:', prompt.length, 'chars')
console.log('')

const result = await generateDiagramImage(prompt, '16:9')

if (!result.ok) {
  console.error('✗ Gemini call failed:', result.error)
  console.error(`  Latency: ${result.latencyMs}ms`)
  process.exit(1)
}

const outPath = '/tmp/smoke-test-diagram.png'
writeFileSync(outPath, Buffer.from(result.data.base64, 'base64'))

console.log('✓ Gemini call succeeded')
console.log(`  Model:    ${result.data.model}`)
console.log(`  MIME:     ${result.data.mimeType}`)
console.log(`  Latency:  ${result.latencyMs}ms`)
console.log(`  Base64:   ${result.data.base64.length} chars`)
console.log(`  Saved to: ${outPath}`)
console.log('')
console.log('  Preview:  open ' + outPath)
