/**
 * orchestrator.ts — fan-out 2 Managed Agents sessions on the C-1 Plan-Then-Build
 * decision. Each session implements one design direction on its own branch and
 * pushes back to the prototype repo.
 *
 * Run:
 *   cd experiments/managed-agents/c1-fanout
 *   npm install
 *   npx tsx orchestrator.ts
 *
 * Prerequisites:
 *   - ANTHROPIC_API_KEY exported (your account must have managed-agents-2026-04-01
 *     enabled — public beta default-on for all API accounts)
 *   - GitHub remote configured for the prototype repo so each session can push
 *     its branch (the agent will try `git push origin <branch>`)
 *   - Repo is on a clean working tree (no uncommitted changes)
 *
 * Cost ceiling: ~$5–15 expected. Two parallel Opus 4.7 sessions, ~10–30 min each
 * containerized. Plus $0.08/session-hour and any web-search calls ($10/1000).
 *
 * The official docs:
 *   https://platform.claude.com/docs/en/managed-agents/quickstart
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Per-session configuration. Each session has its own brief + transcript.
// The two directions test genuinely different bets about the user's mental
// model of "the plan" — Replit's explicit gate vs Canvas's inline preview.
const SESSIONS = [
  {
    label: 'A',
    title: 'C-1 Replit-style toggle',
    briefPath: join(__dirname, 'briefs/a-replit-toggle.md'),
    logPath: join(__dirname, 'logs/a-replit-toggle.jsonl'),
    transcriptPath: join(__dirname, 'outputs/a-replit-toggle.transcript.md'),
  },
  {
    label: 'B',
    title: 'C-1 ChatGPT-Canvas streaming',
    briefPath: join(__dirname, 'briefs/b-canvas-streaming.md'),
    logPath: join(__dirname, 'logs/b-canvas-streaming.jsonl'),
    transcriptPath: join(__dirname, 'outputs/b-canvas-streaming.transcript.md'),
  },
] as const

// 30-min soft cap per session — orchestrator logs a warning if exceeded but
// keeps streaming until session.status_idle. Hard kill is a manual operation.
const SESSION_TIMEOUT_MS = 30 * 60 * 1000

const client = new Anthropic()

async function main() {
  console.log('[orchestrator] starting C-1 fan-out — 2 sessions in parallel\n')

  await mkdir(join(__dirname, 'logs'), { recursive: true })
  await mkdir(join(__dirname, 'outputs'), { recursive: true })

  // Step 1: Create the agent once. Both sessions reference it.
  // The system prompt is intentionally generic — the per-session brief carries
  // the variant-specific context. agent_toolset_20260401 bundles bash + file
  // I/O + web search.
  const agent = await client.beta.agents.create({
    name: 'C-1 prototype implementer',
    model: 'claude-opus-4-7',
    system: [
      'You are a senior React + TypeScript engineer implementing a single design',
      'variant for the NextWork generator prototype.',
      '',
      'You will receive a design brief as your first user message. Read it',
      'carefully — it tells you exactly how to clone, what to change, and how',
      'to deliver your work as a diff (NOT as a pushed branch).',
      '',
      'Workflow at a glance (full details in the brief):',
      '  1. git clone the repo into the container',
      '  2. checkout v2-outline-experiment (the active prototype branch)',
      '  3. npm install',
      '  4. Make changes — only in files the brief lists',
      '  5. npm run typecheck (must pass — fix source errors, never @ts-ignore)',
      '  6. git diff > /tmp/changes.diff && cat /tmp/changes.diff (your deliverable)',
      '  7. Print a summary and exit',
      '',
      'Hard rules:',
      '  - Do NOT commit, push, or create branches. Your deliverable is the diff.',
      '  - Never edit files outside the brief\'s allowlist',
      '  - Never suppress type errors with @ts-ignore or as any',
      '  - Architecture diagram remains the centerpiece (universal positive)',
      '',
      'If you get stuck or need to deviate, document why in your final summary',
      'and still produce a partial diff. The orchestrator captures everything',
      'you print, so be deliberate about what goes in your final messages.',
    ].join('\n'),
    tools: [{ type: 'agent_toolset_20260401' }],
  })

  console.log(`[orchestrator] agent created: ${agent.id} (v${agent.version})`)

  // Step 2: Create the environment. Cloud container with unrestricted networking
  // so it can git-push and npm-install. The repo gets cloned in via the agent's
  // initial bash commands rather than mounted — keeps the environment definition
  // simple and lets the agent verify clean state itself.
  const environment = await client.beta.environments.create({
    name: 'c1-fanout-env',
    config: {
      type: 'cloud',
      networking: { type: 'unrestricted' },
    },
  })

  console.log(`[orchestrator] environment created: ${environment.id}\n`)

  // Step 3: Fire both sessions in parallel.
  const startedAt = Date.now()
  const results = await Promise.all(
    SESSIONS.map((cfg) => runSession(cfg, agent.id, environment.id)),
  )
  const totalMs = Date.now() - startedAt

  console.log('\n[orchestrator] all sessions complete')
  console.log(`[orchestrator] wall time: ${(totalMs / 1000).toFixed(1)}s\n`)

  for (const r of results) {
    console.log(`  Session ${r.label}: ${r.outcome}`)
    console.log(`    session id:   ${r.sessionId}`)
    console.log(`    elapsed:      ${(r.elapsedMs / 1000).toFixed(1)}s`)
    console.log(`    events seen:  ${r.eventCount}`)
    console.log(`    transcript:   ${r.transcriptPath}`)
    console.log(`    raw log:      ${r.logPath}`)
    if (r.warning) console.log(`    ⚠  ${r.warning}`)
    console.log()
  }

  console.log('[orchestrator] next step:')
  console.log('  Each transcript ends with a `git diff` patch.')
  console.log('  Extract the diff section, save as session-a.diff / session-b.diff,')
  console.log('  then in the prototype repo:')
  console.log('    git checkout v2-outline-experiment')
  console.log('    git checkout -b experiment/c1-replit-toggle')
  console.log('    git apply path/to/session-a.diff')
  console.log('    npm run typecheck && npm run dev')
  console.log('  Repeat for session-b.diff on its own branch.')
}

interface SessionConfig {
  label: string
  title: string
  briefPath: string
  logPath: string
  transcriptPath: string
}

interface SessionResult {
  label: string
  sessionId: string
  outcome: 'idle' | 'timeout' | 'error'
  elapsedMs: number
  eventCount: number
  logPath: string
  transcriptPath: string
  warning?: string
}

async function runSession(
  cfg: SessionConfig,
  agentId: string,
  environmentId: string,
): Promise<SessionResult> {
  const brief = await readFile(cfg.briefPath, 'utf8')

  console.log(`[session ${cfg.label}] creating session — ${cfg.title}`)

  const session = await client.beta.sessions.create({
    agent: agentId,
    environment_id: environmentId,
    title: cfg.title,
  })

  console.log(`[session ${cfg.label}] session id: ${session.id}`)

  const startedAt = Date.now()
  let eventCount = 0
  let outcome: SessionResult['outcome'] = 'error'
  let warning: string | undefined
  // Accumulate all agent text + tool-call markers into one transcript file.
  // The agent's final messages will include the full `git diff` output, which
  // is the deliverable for this experiment.
  const transcript: string[] = [
    `# Transcript — Session ${cfg.label} (${cfg.title})`,
    `_session id: ${session.id}_`,
    `_started: ${new Date(startedAt).toISOString()}_`,
    '',
  ]

  const stream = await client.beta.sessions.events.stream(session.id)

  // Send the brief as the first user message after the stream is open.
  await client.beta.sessions.events.send(session.id, {
    events: [
      {
        type: 'user.message',
        content: [{ type: 'text', text: brief }],
      },
    ],
  })

  try {
    for await (const event of stream) {
      eventCount += 1

      // Append every event to the per-session JSONL log. The full event trail
      // is persisted server-side too, but a local copy makes post-run review
      // cheap.
      await appendLog(cfg.logPath, event)

      // Surface high-signal events to stdout so you can watch progress.
      // Also accumulate into the transcript file — that's where the diff
      // ultimately lands.
      if (event.type === 'agent.message') {
        const text = (event.content ?? [])
          .filter((b: { type: string }) => b.type === 'text')
          .map((b: { type: string; text?: string }) => b.text ?? '')
          .join('')
        if (text.trim()) {
          process.stdout.write(`[session ${cfg.label}] ${text}\n`)
          transcript.push(text)
        }
      } else if (event.type === 'agent.tool_use') {
        const toolName = (event as { name?: string }).name ?? 'unknown'
        process.stdout.write(`[session ${cfg.label}] [tool: ${toolName}]\n`)
        transcript.push(`\n_[tool call: ${toolName}]_\n`)
      } else if (event.type === 'session.status_idle') {
        outcome = 'idle'
        console.log(`[session ${cfg.label}] ✓ status_idle reached`)
        break
      }

      // Soft timeout — log a warning the first time we cross the 30-min mark
      // but keep streaming. The agent might still be wrapping up; cutting it
      // off mid-push could leave a half-committed branch.
      const elapsedMs = Date.now() - startedAt
      if (!warning && elapsedMs > SESSION_TIMEOUT_MS) {
        warning = `exceeded ${SESSION_TIMEOUT_MS / 1000 / 60}-min soft cap — still streaming`
        console.warn(`[session ${cfg.label}] ⚠  ${warning}`)
      }
    }
  } catch (err) {
    outcome = 'error'
    warning = err instanceof Error ? err.message : String(err)
    console.error(`[session ${cfg.label}] error:`, err)
  }

  // Always write the transcript, even on error or timeout — it captures
  // whatever the agent did manage to produce.
  transcript.push('', `_finished: ${new Date().toISOString()}_`, `_outcome: ${outcome}_`)
  await writeFile(cfg.transcriptPath, transcript.join('\n'), 'utf8')

  return {
    label: cfg.label,
    sessionId: session.id,
    outcome,
    elapsedMs: Date.now() - startedAt,
    eventCount,
    logPath: cfg.logPath,
    transcriptPath: cfg.transcriptPath,
    warning,
  }
}

async function appendLog(path: string, event: unknown): Promise<void> {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
  }) + '\n'
  // Read-modify-write — fine at this scale (events arrive serially per session).
  let existing = ''
  try {
    existing = await readFile(path, 'utf8')
  } catch {
    // file doesn't exist yet — first event of the session
  }
  await writeFile(path, existing + line, 'utf8')
}

main().catch((err) => {
  console.error('[orchestrator] fatal:', err)
  process.exit(1)
})
