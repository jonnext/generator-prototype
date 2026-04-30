/**
 * recover-session.ts — fetch the full server-side event history for a session
 * whose stream dropped client-side. Anthropic persists events server-side so
 * a stream disconnect doesn't lose work.
 *
 * Usage:
 *   npx tsx recover-session.ts <session_id> <output_label>
 *
 * Example:
 *   npx tsx recover-session.ts sesn_011CaaYFvYHhXcsQ2sDq7Ez3 a-replit-toggle
 *
 * Writes:
 *   logs/<label>.recovered.jsonl — full event history pulled from server
 *   outputs/<label>.diff         — extracted git diff if found
 *   outputs/<label>.tool-history.md — every tool call + result
 */

import Anthropic from '@anthropic-ai/sdk'
import { writeFile, appendFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const sessionId = process.argv[2]
const label = process.argv[3]

if (!sessionId || !label) {
  console.error('Usage: npx tsx recover-session.ts <session_id> <output_label>')
  process.exit(1)
}

const client = new Anthropic()

async function main() {
  console.log(`[recover] fetching events for ${sessionId}…`)

  const logPath = join(__dirname, `logs/${label}.recovered.jsonl`)
  await writeFile(logPath, '', 'utf8') // truncate

  let count = 0
  let lastStatus = ''
  const toolHistory: string[] = [`# ${label} — recovered tool history`, '']
  const candidateDiffs: { idx: number; text: string }[] = []
  let lastToolUse: { name?: string } | null = null

  const stream = client.beta.sessions.events.list(sessionId)
  for await (const event of stream) {
    count += 1
    await appendFile(logPath, JSON.stringify({ event }) + '\n', 'utf8')
    if (event.type === 'agent.tool_use') {
      lastToolUse = { name: (event as { name?: string }).name }
      toolHistory.push(`## tool_use #${count} — ${lastToolUse.name}`)
      const input = (event as { input?: unknown }).input
      toolHistory.push('```json')
      toolHistory.push(JSON.stringify(input, null, 2).slice(0, 1500))
      toolHistory.push('```\n')
    } else if (event.type === 'agent.tool_result') {
      const c = (event as { content?: unknown }).content
      const text = extractText(c)
      toolHistory.push(`## tool_result #${count} — for ${lastToolUse?.name ?? '?'}`)
      toolHistory.push('```')
      toolHistory.push(text.slice(0, 2000) + (text.length > 2000 ? `\n…[truncated, ${text.length} chars]` : ''))
      toolHistory.push('```\n')
      if (looksLikeDiff(text)) {
        candidateDiffs.push({ idx: count, text })
      }
    } else if (event.type === 'session.status_running' || event.type === 'session.status_idle') {
      lastStatus = event.type
      console.log(`[recover] saw ${event.type} at event #${count}`)
    }
  }

  console.log(`[recover] ${count} events pulled, log saved to ${logPath}`)
  console.log(`[recover] last status seen: ${lastStatus}`)

  const toolHistoryPath = join(__dirname, `outputs/${label}.tool-history.md`)
  await writeFile(toolHistoryPath, toolHistory.join('\n'), 'utf8')
  console.log(`[recover] tool history → ${toolHistoryPath}`)

  candidateDiffs.sort((a, b) => b.text.length - a.text.length)
  if (candidateDiffs.length === 0) {
    console.log(`[recover] ⚠  no git-diff content in any tool_result`)
    return
  }

  const winner = candidateDiffs[0]
  const diffPath = join(__dirname, `outputs/${label}.diff`)
  await writeFile(diffPath, winner.text + (winner.text.endsWith('\n') ? '' : '\n'), 'utf8')
  console.log(`[recover] diff (${candidateDiffs.length} candidates, picked event #${winner.idx}, ${winner.text.length} chars) → ${diffPath}`)
  if (candidateDiffs.length > 1) {
    candidateDiffs.slice(1).forEach((c) => console.log(`           other candidate event #${c.idx}: ${c.text.length} chars`))
  }
}

function extractText(c: unknown): string {
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    return c
      .map((b: unknown) => {
        if (typeof b === 'string') return b
        if (b && typeof b === 'object') {
          const obj = b as { text?: string; content?: string; output?: string }
          return obj.text ?? obj.content ?? obj.output ?? ''
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (c && typeof c === 'object') {
    const obj = c as { text?: string; output?: string; stdout?: string }
    return obj.text ?? obj.output ?? obj.stdout ?? ''
  }
  return ''
}

function looksLikeDiff(text: string): boolean {
  return /^diff --git /m.test(text) && /^@@ /m.test(text)
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
