/**
 * extract-diffs.ts — recover the agent's git diff output from the raw JSONL
 * event logs. The orchestrator's transcript captured agent.message text but
 * not agent.tool_result content, so the diffs (which came back as bash
 * stdout from `cat /tmp/changes.diff`) need to be pulled out manually.
 *
 * Run:
 *   npx tsx extract-diffs.ts
 *
 * For each session, this writes:
 *   outputs/{label}.diff           — the largest tool_result block that looks
 *                                    like a git diff (heuristic on diff markers)
 *   outputs/{label}.tool-history.md — every tool_use + tool_result, concatenated,
 *                                    so you can review what each agent did even
 *                                    if the diff extraction is incomplete
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface LogEntry {
  timestamp: string
  event: {
    type: string
    name?: string
    input?: unknown
    content?: unknown
    [k: string]: unknown
  }
}

const SESSIONS = [
  { label: 'a-replit-toggle', logFile: 'logs/a-replit-toggle.jsonl' },
  { label: 'b-canvas-streaming', logFile: 'logs/b-canvas-streaming.jsonl' },
]

function eventTextContent(event: LogEntry['event']): string {
  const c = event.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    return c
      .map((b: unknown) => {
        if (typeof b === 'string') return b
        if (b && typeof b === 'object') {
          const obj = b as { text?: string; content?: string; output?: string; type?: string }
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
  // A git diff with at least one file header and one hunk marker
  return /^diff --git /m.test(text) && /^@@ /m.test(text)
}

async function main() {
  for (const cfg of SESSIONS) {
    console.log(`\n=== ${cfg.label} ===`)
    const path = join(__dirname, cfg.logFile)
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch {
      console.log(`  log not found, skipping`)
      continue
    }

    const entries: LogEntry[] = raw
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as LogEntry)

    console.log(`  ${entries.length} events total`)

    const toolHistory: string[] = [`# ${cfg.label} — tool history`, '']
    const candidateDiffs: { idx: number; text: string }[] = []
    let lastToolUse: { name?: string; input?: unknown } | null = null

    entries.forEach((entry, idx) => {
      const e = entry.event
      if (e.type === 'agent.tool_use') {
        lastToolUse = { name: e.name, input: e.input }
        toolHistory.push(`## tool_use #${idx} — ${e.name}`)
        toolHistory.push('```json')
        toolHistory.push(JSON.stringify(e.input, null, 2).slice(0, 1500))
        toolHistory.push('```')
        toolHistory.push('')
      } else if (e.type === 'agent.tool_result') {
        const text = eventTextContent(e)
        toolHistory.push(`## tool_result #${idx} — for ${lastToolUse?.name ?? '?'}`)
        toolHistory.push('```')
        toolHistory.push(text.slice(0, 2000) + (text.length > 2000 ? `\n…[truncated, ${text.length} chars total]` : ''))
        toolHistory.push('```')
        toolHistory.push('')
        if (looksLikeDiff(text)) {
          candidateDiffs.push({ idx, text })
        }
      }
    })

    // Pick the largest diff candidate — more content usually means the final,
    // most complete diff rather than a partial one mid-edit.
    candidateDiffs.sort((a, b) => b.text.length - a.text.length)

    const toolHistoryPath = join(__dirname, `outputs/${cfg.label}.tool-history.md`)
    await writeFile(toolHistoryPath, toolHistory.join('\n'), 'utf8')
    console.log(`  tool history → ${toolHistoryPath}`)

    if (candidateDiffs.length === 0) {
      console.log(`  ⚠  no git-diff content found in tool results`)
      continue
    }

    const winner = candidateDiffs[0]
    const diffPath = join(__dirname, `outputs/${cfg.label}.diff`)
    await writeFile(diffPath, winner.text + (winner.text.endsWith('\n') ? '' : '\n'), 'utf8')
    console.log(`  diff (${candidateDiffs.length} candidates, picked event #${winner.idx}, ${winner.text.length} chars) → ${diffPath}`)

    // List all candidates so we can spot if the heuristic picked wrong
    if (candidateDiffs.length > 1) {
      console.log(`  other diff candidates:`)
      candidateDiffs.slice(1).forEach((c) => console.log(`    event #${c.idx}: ${c.text.length} chars`))
    }
  }
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
