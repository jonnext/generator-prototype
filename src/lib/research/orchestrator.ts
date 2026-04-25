// Research orchestrator — DP1.5.E.
//
// The brain of Phase R. Takes a ResearchIntent (initial submit, pill toggle,
// step add, chat message) and executes the two-stage pipeline the plan
// describes:
//
//   Stage 1 — discovery (parallel fan-out, 6s timeout each):
//     • Exa semantic search           (always)
//     • Perplexity AI answer          (always)
//     • Context7 library docs         (only if a library/SDK is detected)
//
//   Stage 2 — deep-read (fires once Stage 1 surfaces URLs):
//     • Firecrawl scrape on top 5 URLs from Stage 1 citations/snippets
//     • Findings tagged freshness: 'high' so section generator prefers them
//
// The orchestrator is eager — `fireResearch(intent, opts)` returns a
// ResearchRun immediately, with Stage 1 and Stage 2 already in flight on
// the callback path. Phase B (DP1.5.F) awaits `run.stage1` before Pass 1,
// `run.stage2` before Pass 2 — unless the topic is freshness-critical, in
// which case Phase B delays Pass 1 until Stage 2 lands.
//
// Module-level state holds the dedup sliding window and the rate limiter.
// Both are singletons for the session and are cleaned lazily on every
// fireResearch call.

import { runExaSearch } from './exa'
import { runPerplexityAsk } from './perplexity'
import { runFirecrawlScrape, runFirecrawlSearch } from './firecrawl'
import { runContext7Query } from './context7'
import type { ResearchFinding, ResearchSnippet } from './types'

// ----------------------------------------------------------------------------
// Public types — intents, run handle, stage summaries, options
// ----------------------------------------------------------------------------

/**
 * Why research is firing. Drives query construction, step scoping, and
 * which tools the orchestrator considers conditional (Context7, Firecrawl
 * search vs scrape).
 */
export type ResearchIntent =
  | {
      kind: 'initial-submit'
      /** Student's original prompt. */
      intent: string
      /** All steps the skeleton produced, in order. Findings are tagged
       *  with every step id so any step can draw on project-wide research. */
      steps: Array<{ id: string; heading: string }>
    }
  | {
      kind: 'pill-toggle'
      stepId: string
      stepHeading: string
      decisionType: string
      /** The option the student just picked. */
      newSelection: string
      /** The option previously selected, if any. */
      oldSelection: string | null
    }
  | {
      kind: 'step-add'
      stepId: string
      stepHeading: string
      /** The project's overall intent — gives the new step contextual framing. */
      projectIntent: string
    }
  | {
      kind: 'chat-message'
      /** Free-text topic the message introduced. */
      topic: string
      /** Steps the message affects. */
      stepIds: string[]
      /** The project's overall intent. */
      projectIntent: string
    }

export interface Stage1Summary {
  findingsAdded: number
  /** URLs the Stage 1 fan-out surfaced — handed to Stage 2. */
  urlsDiscovered: string[]
  errors: string[]
}

export interface Stage2Summary {
  findingsAdded: number
  scrapesSuccessful: number
  errors: string[]
}

export interface ResearchRun {
  /** Resolves when all Stage 1 tools have settled (or timed out). */
  stage1: Promise<Stage1Summary>
  /** Resolves when Stage 2 Firecrawl scrapes have settled. */
  stage2: Promise<Stage2Summary>
  /** Freshness detector verdict — caller uses this to decide whether Pass 1
   *  in Phase B should wait for Stage 2 before running. Available immediately. */
  freshnessCritical: boolean
  /** Abort the whole run. In-flight tool calls are cancelled via their
   *  adapter signals; pending calls are never started. */
  abort: () => void
}

export interface FireResearchOpts {
  /** Called as each finding lands. Consumers typically pass the research
   *  store's `addFinding` action straight through. Called for both ready
   *  and failed findings — failed findings are still useful telemetry. */
  onFinding: (finding: ResearchFinding) => void
  /** Called when the branch-candidate heuristic fires on a ready finding.
   *  Consumer typically passes `flagBranchCandidate`. Optional. */
  onBranchCandidate?: (findingId: string) => void
  /** Caller's abort signal. Aborts composed with the orchestrator's
   *  internal abort for rate-limit cleanup. */
  signal?: AbortSignal
}

// ----------------------------------------------------------------------------
// Heuristics — freshness, library detection, branch candidate
// ----------------------------------------------------------------------------

/**
 * Freshness-critical detector. Coarse keyword heuristic per plan
 * assumption 8 — refinement happens post-DP1.5 with real prompts. The
 * intent is to catch topics where LLM training cutoffs are likely stale:
 * bleeding-edge SDKs, products released post-training, explicit "latest"
 * language in the prompt.
 */
const FRESHNESS_PATTERNS: RegExp[] = [
  /\bopen[- ]?claw\b/i,
  /\bclaude[- ]?(?:code|sdk|api|agent)\b/i,
  /\b(?:anthropic|openai)\s+(?:sdk|api|agent)\b/i,
  /\blatest\b/i,
  /\bcurrent(?:ly)?\b/i,
  /\bnewest\b/i,
  /\btoday\b/i,
  /\b202[5-9]\b/,
  /\bnext\.?js\s+1[5-9]\b/i,
  /\breact\s+1?9\b/i,
  /\bbleeding[- ]?edge\b/i,
  /\brecently?\b/i,
]

export function isFreshnessCritical(text: string): boolean {
  return FRESHNESS_PATTERNS.some((re) => re.test(text))
}

/**
 * Detect whether a query/heading likely names a library, framework, or SDK
 * that Context7 can answer about. Keeps Context7 from firing on cooking or
 * music prompts where it has nothing to say.
 */
const LIBRARY_PATTERNS: RegExp[] = [
  /\b(?:npm|pnpm|yarn|pip|cargo|gem|go\s+get)\s+(?:install|add)\b/i,
  /\b(?:react|vue|svelte|angular|next\.?js|nuxt|remix|astro|solid\.?js)\b/i,
  /\b(?:express|fastify|koa|nest\.?js|hono)\b/i,
  /\b(?:rails|django|flask|laravel|phoenix|gin)\b/i,
  /\b(?:anthropic|openai|langchain|llamaindex|pydantic)\b/i,
  /\b(?:docker|kubernetes|terraform|pulumi|ansible)\b/i,
  /\b(?:postgres|mongodb|mysql|redis|sqlite|dynamodb)\b/i,
  /\b(?:typescript|python|rust|golang|elixir)\b/i,
  /\b@[\w-]+\/[\w-]+\b/, // scoped npm package
]

export function detectsLibrary(text: string): boolean {
  return LIBRARY_PATTERNS.some((re) => re.test(text))
}

/**
 * Branch-candidate heuristic. Flags findings whose snippet text uses
 * comparative/contrastive language suggesting the current pathway might
 * be outdated or suboptimal. Coarse by design — DP1.5.J refinement
 * happens with real usage.
 */
const BRANCH_PATTERNS: RegExp[] = [
  /\b(?:use|uses|using|prefer|choose|pick|recommend)\s+[\w.-]+(?:\s+[\w.-]+){0,4}\s+(?:instead of|rather than|over)\s+/i,
  /\bmost\s+(?:\w+\s+){0,3}(?:tutorials?|projects?|developers?|teams?|users?|apps?|services?)\s+(?:now|today|in 2026|currently)\b/i,
  /\b(?:has been |is |was )?(?:replaced|superseded|deprecated|sunset)\b/i,
  /\b(?:migrated?|migration)\s+(?:from|to|away from)\b/i,
  /\b(?:since|as of)\s+(?:202[5-9]|version)\b/i,
]

export function detectBranchCandidate(finding: ResearchFinding): boolean {
  if (finding.status !== 'ready' || finding.snippets.length === 0) return false
  return finding.snippets.some((s) =>
    BRANCH_PATTERNS.some((re) => re.test(s.content)),
  )
}

// ----------------------------------------------------------------------------
// Module-level state: dedup sliding window + rate limiter
// ----------------------------------------------------------------------------

const DEDUP_WINDOW_MS = 30_000
const RATE_LIMIT_PARALLEL = 8

interface DedupEntry {
  timestamp: number
}

const dedupMap = new Map<string, DedupEntry>()

function dedupKey(
  tool: 'exa' | 'perplexity' | 'context7' | 'firecrawl-search' | 'firecrawl-scrape',
  queryOrUrl: string,
): string {
  return `${tool}::${queryOrUrl.slice(0, 300).toLowerCase().trim()}`
}

function pruneDedup(): void {
  const now = Date.now()
  for (const [key, entry] of dedupMap) {
    if (now - entry.timestamp > DEDUP_WINDOW_MS) dedupMap.delete(key)
  }
}

function shouldSkipDedup(key: string): boolean {
  const entry = dedupMap.get(key)
  if (!entry) return false
  return Date.now() - entry.timestamp < DEDUP_WINDOW_MS
}

function recordDedup(key: string): void {
  dedupMap.set(key, { timestamp: Date.now() })
}

/**
 * Simple parallel-limit semaphore. Returns a wrapper that schedules `fn`
 * to run once an active slot is available. Shared across the whole module
 * so every orchestrator run contends for the same 8 slots.
 */
const limiter = (() => {
  let active = 0
  const queue: Array<() => void> = []

  async function acquire(): Promise<void> {
    if (active < RATE_LIMIT_PARALLEL) {
      active++
      return
    }
    await new Promise<void>((resolve) => queue.push(resolve))
    active++
  }

  function release(): void {
    active--
    const next = queue.shift()
    if (next) next()
  }

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire()
      try {
        return await fn()
      } finally {
        release()
      }
    },
  }
})()

// ----------------------------------------------------------------------------
// Intent → query plan
// ----------------------------------------------------------------------------

interface ResearchPlan {
  /** Queries to run in Stage 1, with per-call target step scoping. */
  stage1: Array<{
    tool: 'exa' | 'perplexity' | 'context7'
    query: string
    relatedStepIds: string[]
  }>
  /** Whether Context7 should fire (based on library detection on the plan text). */
  includeContext7: boolean
  /** All step ids this research run is scoped to. Used for Stage 2 tagging. */
  allRelatedStepIds: string[]
  /** Text used for the freshness-critical check. */
  freshnessProbeText: string
}

function buildPlan(intent: ResearchIntent): ResearchPlan {
  switch (intent.kind) {
    case 'initial-submit': {
      const stepIds = intent.steps.map((s) => s.id)
      const includeContext7 = detectsLibrary(intent.intent)
      const stage1: ResearchPlan['stage1'] = [
        { tool: 'exa', query: intent.intent, relatedStepIds: stepIds },
        {
          tool: 'perplexity',
          query: `In 2026, what's the current best approach for: ${intent.intent}. Include specific tools, version constraints, and known pitfalls.`,
          relatedStepIds: stepIds,
        },
      ]
      if (includeContext7) {
        stage1.push({
          tool: 'context7',
          query: intent.intent,
          relatedStepIds: stepIds,
        })
      }
      return {
        stage1,
        includeContext7,
        allRelatedStepIds: stepIds,
        freshnessProbeText: intent.intent,
      }
    }

    case 'pill-toggle': {
      // Scoped to the affected step. Research focuses on the newly picked
      // option — its tradeoffs, setup specifics, current best practices.
      const query = `${intent.stepHeading}: ${intent.decisionType} — chose ${intent.newSelection}${intent.oldSelection ? ` instead of ${intent.oldSelection}` : ''}. What are the current implementation specifics, gotchas, and version requirements?`
      const includeContext7 = detectsLibrary(query)
      const stage1: ResearchPlan['stage1'] = [
        {
          tool: 'exa',
          query: `${intent.newSelection} ${intent.stepHeading} 2026`,
          relatedStepIds: [intent.stepId],
        },
        {
          tool: 'perplexity',
          query,
          relatedStepIds: [intent.stepId],
        },
      ]
      if (includeContext7) {
        stage1.push({
          tool: 'context7',
          query: intent.newSelection,
          relatedStepIds: [intent.stepId],
        })
      }
      return {
        stage1,
        includeContext7,
        allRelatedStepIds: [intent.stepId],
        freshnessProbeText: query,
      }
    }

    case 'step-add': {
      const query = `${intent.stepHeading} — in the context of the project: ${intent.projectIntent}`
      const includeContext7 = detectsLibrary(query)
      const stage1: ResearchPlan['stage1'] = [
        { tool: 'exa', query, relatedStepIds: [intent.stepId] },
        {
          tool: 'perplexity',
          query: `For this learning step "${intent.stepHeading}" in a project about "${intent.projectIntent}" — what are the current best practices, tools, and common pitfalls?`,
          relatedStepIds: [intent.stepId],
        },
      ]
      if (includeContext7) {
        stage1.push({
          tool: 'context7',
          query: intent.stepHeading,
          relatedStepIds: [intent.stepId],
        })
      }
      return {
        stage1,
        includeContext7,
        allRelatedStepIds: [intent.stepId],
        freshnessProbeText: query,
      }
    }

    case 'chat-message': {
      const query = `${intent.topic} — relevant to: ${intent.projectIntent}`
      const includeContext7 = detectsLibrary(query)
      const stage1: ResearchPlan['stage1'] = [
        { tool: 'exa', query, relatedStepIds: intent.stepIds },
        {
          tool: 'perplexity',
          query: `In the context of a project about "${intent.projectIntent}", explain: ${intent.topic}. Include current best practices and 2026 updates.`,
          relatedStepIds: intent.stepIds,
        },
      ]
      if (includeContext7) {
        stage1.push({
          tool: 'context7',
          query: intent.topic,
          relatedStepIds: intent.stepIds,
        })
      }
      return {
        stage1,
        includeContext7,
        allRelatedStepIds: intent.stepIds,
        freshnessProbeText: query,
      }
    }
  }
}

// ----------------------------------------------------------------------------
// Stage runners
// ----------------------------------------------------------------------------

interface StageRunContext {
  plan: ResearchPlan
  opts: FireResearchOpts
  signal: AbortSignal
}

async function runStage1(ctx: StageRunContext): Promise<Stage1Summary> {
  const urls = new Set<string>()
  const errors: string[] = []
  let findingsAdded = 0

  const calls = ctx.plan.stage1.map((spec) =>
    limiter.run(() => callStage1Tool(spec, ctx.signal)),
  )
  const settled = await Promise.allSettled(calls)

  for (const result of settled) {
    if (result.status === 'rejected') {
      errors.push(String(result.reason))
      continue
    }
    const { finding, callError } = result.value
    if (callError) errors.push(callError)
    if (finding) {
      ctx.opts.onFinding(finding)
      findingsAdded++
      if (finding.status === 'ready') {
        // Collect URLs for Stage 2 scrapes.
        for (const snippet of finding.snippets) {
          if (snippet.url) urls.add(snippet.url)
        }
        // Fire the branch-candidate heuristic if a callback is wired.
        if (ctx.opts.onBranchCandidate && detectBranchCandidate(finding)) {
          ctx.opts.onBranchCandidate(finding.id)
        }
      }
    }
  }

  return {
    findingsAdded,
    urlsDiscovered: Array.from(urls),
    errors,
  }
}

async function callStage1Tool(
  spec: ResearchPlan['stage1'][number],
  signal: AbortSignal,
): Promise<{ finding: ResearchFinding | null; callError?: string }> {
  const key = dedupKey(spec.tool, spec.query)
  if (shouldSkipDedup(key)) {
    return {
      finding: null,
      callError: `dedup-skip ${spec.tool}`,
    }
  }
  recordDedup(key)

  const callOpts = {
    signal,
    relatedStepIds: spec.relatedStepIds,
    timeoutMs: 6000,
  }

  switch (spec.tool) {
    case 'exa':
      return { finding: await runExaSearch(spec.query, callOpts) }
    case 'perplexity':
      return { finding: await runPerplexityAsk(spec.query, callOpts) }
    case 'context7':
      return { finding: await runContext7Query(spec.query, callOpts) }
  }
}

async function runStage2(
  urls: string[],
  ctx: StageRunContext,
): Promise<Stage2Summary> {
  // Top 5 URLs — dedup already happened upstream (same URL from Exa + Perplexity
  // collapses into one), so we just slice.
  const targets = urls.slice(0, 5)

  const errors: string[] = []
  let findingsAdded = 0
  let scrapesSuccessful = 0

  const calls = targets.map((url) =>
    limiter.run(() => callStage2Tool(url, ctx.plan.allRelatedStepIds, ctx.signal)),
  )
  const settled = await Promise.allSettled(calls)

  for (const result of settled) {
    if (result.status === 'rejected') {
      errors.push(String(result.reason))
      continue
    }
    const { finding, callError } = result.value
    if (callError) errors.push(callError)
    if (finding) {
      ctx.opts.onFinding(finding)
      findingsAdded++
      if (finding.status === 'ready') {
        scrapesSuccessful++
        // Firecrawl findings are the most likely branch-candidate triggers
        // because they're live page content with concrete "use X instead of Y"
        // language. Fire the heuristic on Stage 2 findings too.
        if (ctx.opts.onBranchCandidate && detectBranchCandidate(finding)) {
          ctx.opts.onBranchCandidate(finding.id)
        }
      }
    }
  }

  return { findingsAdded, scrapesSuccessful, errors }
}

async function callStage2Tool(
  url: string,
  relatedStepIds: string[],
  signal: AbortSignal,
): Promise<{ finding: ResearchFinding | null; callError?: string }> {
  const key = dedupKey('firecrawl-scrape', url)
  if (shouldSkipDedup(key)) {
    return { finding: null, callError: `dedup-skip firecrawl-scrape ${url}` }
  }
  recordDedup(key)

  const finding = await runFirecrawlScrape(url, {
    signal,
    relatedStepIds,
    timeoutMs: 8000,
  })
  return { finding }
}

// ----------------------------------------------------------------------------
// fireResearch — the entry point
// ----------------------------------------------------------------------------

/**
 * Kick off a research run. Returns immediately with a handle whose `stage1`
 * and `stage2` promises are already in flight on the callback path.
 *
 * Findings stream through `opts.onFinding` as they arrive — not via the
 * returned promises. The promises resolve to summaries (counts, URLs) so
 * Phase B can know when each stage completed without re-collecting findings.
 */
export function fireResearch(
  intent: ResearchIntent,
  opts: FireResearchOpts,
): ResearchRun {
  pruneDedup()

  const internalAbort = new AbortController()
  if (opts.signal) {
    if (opts.signal.aborted) internalAbort.abort()
    else opts.signal.addEventListener('abort', () => internalAbort.abort(), { once: true })
  }

  const plan = buildPlan(intent)
  const freshnessCritical = isFreshnessCritical(plan.freshnessProbeText)

  const ctx: StageRunContext = { plan, opts, signal: internalAbort.signal }

  // Stage 1 starts immediately.
  const stage1Promise = runStage1(ctx).catch((err) => {
    // Should never happen (runStage1 catches its own errors) but belt-and-
    // braces — we don't want Phase B to await a rejected promise.
    return {
      findingsAdded: 0,
      urlsDiscovered: [] as string[],
      errors: [String(err)],
    } satisfies Stage1Summary
  })

  // Stage 2 chains off Stage 1's URL discovery. Firing Firecrawl before
  // Stage 1 returns URLs would waste the scrape budget on non-curated
  // targets — the sequencing IS the orchestrator's value.
  const stage2Promise: Promise<Stage2Summary> = stage1Promise.then(
    (stage1Summary) => {
      if (stage1Summary.urlsDiscovered.length === 0) {
        return {
          findingsAdded: 0,
          scrapesSuccessful: 0,
          errors: stage1Summary.errors.length
            ? [`Stage 2 skipped — Stage 1 surfaced no URLs (${stage1Summary.errors.length} errors)`]
            : ['Stage 2 skipped — Stage 1 surfaced no URLs'],
        }
      }
      return runStage2(stage1Summary.urlsDiscovered, ctx).catch((err) => ({
        findingsAdded: 0,
        scrapesSuccessful: 0,
        errors: [String(err)],
      }))
    },
  )

  return {
    stage1: stage1Promise,
    stage2: stage2Promise,
    freshnessCritical,
    abort: () => internalAbort.abort(),
  }
}

/**
 * Convenience for DP1.5.I sculpting triggers — Firecrawl search (Stage 1
 * broad-web search, NOT scrape) isn't used in any of the four intents
 * above because the Stage 1 fan-out already covers Exa + Perplexity which
 * overlap Firecrawl search's function. Exposed here for future code paths
 * that want the Firecrawl index specifically (e.g. crypto/commerce topics
 * that benefit from Google-style indexing over Exa's semantic embedding).
 */
export async function runFirecrawlSearchDirect(
  query: string,
  relatedStepIds: string[] = [],
  signal?: AbortSignal,
): Promise<ResearchFinding> {
  return runFirecrawlSearch(query, { signal, relatedStepIds })
}

// ----------------------------------------------------------------------------
// Re-exports
// ----------------------------------------------------------------------------

export type { ResearchFinding, ResearchSnippet }
