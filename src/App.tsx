// Root component — owns the composed shaping engine and routes on phase.
//
// One useShapingEngine() call lives here. Each screen receives only the
// slice data it needs via props, and is wrapped in React.memo so a slice
// tick (e.g. chat pulse) doesn't re-render the other screen.
//
// I8 attaches Claude integration:
//   - handleGenerate kicks off the Action Plan call (non-streaming, returns
//     the full skeleton in one shot) followed by parallel step body streams
//     via Promise.all per the async-parallel rule.
//   - Each step body streams independently into the reducer so Step 1
//     renders text the moment its first chunk lands, while Steps 2-5 are
//     still arriving (the async-suspense-boundaries equivalent for
//     progressive append rather than Suspense mount gates).
//   - Chat send during generation aborts the Action Plan stream suite via
//     a single per-run AbortController, appends the student's message,
//     and re-opens the stream with merged context.
//   - Inpainting hands off to the same streamClaude path, scoped to one
//     step, with the rest of the plan passed as context so a rewrite of
//     Step 2 can't contradict Steps 1 or 3.
//
// Per rerender-no-inline-components every screen component is module-level.
// Per rendering-conditional-render we use a ternary, never &&.

import { AnimatePresence } from 'motion/react'
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { DiscoveryScreen } from '@/screens/DiscoveryScreen'
import { CanvasScreen } from '@/screens/CanvasScreen'
import { HighwayScreen } from '@/screens/HighwayScreen'
import { Toolbar } from '@/components/Toolbar'
import { useShapingEngine, selectIsGenerating } from '@/hooks/useShapingEngine'
import { useFocusNavigation } from '@/hooks/useFocusNavigation'
import { callClaude } from '@/lib/claude'
import {
  buildActionPlanPrompt,
  parseActionPlanSkeleton,
  parsePillDecisions,
  timeMinutesToDurationId,
  type ActionPlanSkeleton,
} from '@/lib/actionPlan'
import { fetchChatAck } from '@/lib/chatAck'
import { researchCache } from '@/hooks/useResearchCache'
import { formatResearchForPrompt } from '@/lib/research'
import { ResearchDebugPanel } from '@/components/debug/ResearchDebugPanel'
import {
  fireResearch,
  type ResearchIntent,
  type ResearchRun,
} from '@/lib/research/orchestrator'
import { formatFindingsForPrompt } from '@/lib/research/format'
import {
  generateStepBlocks,
  type OutlineContext,
  type PriorStepContext,
} from '@/lib/sectionGenerator'
import type {
  ActionPlan,
  ChatMessage,
  ContentBlock,
  DiagramStatus,
  Phase,
  PersonalPills,
  PillDefinition,
  ResearchFinding,
  Step,
  StepGenerationStatus,
  StepPillRow,
} from '@/lib/state'
import type { ModeId } from '@/lib/copy'

// ----------------------------------------------------------------------------
// Skeleton -> ActionPlan conversion
// ----------------------------------------------------------------------------
//
// The prompt returns a skeleton (title + steps + pill decisions). The reducer
// wants a full ActionPlan (steps with pills, pillDefinitions map). One pure
// function, kept at module level per rerender-no-inline-components so its
// identity is stable across renders even though App only calls it inside
// event handlers.

function skeletonToActionPlan(skeleton: ActionPlanSkeleton): ActionPlan {
  // Collect pill definitions across all steps into a single map keyed by
  // decisionType. The parser dedupes pills within a step; this dedupes
  // across steps so two steps referencing the same decision share one
  // definition. First occurrence wins.
  const pillDefinitions: Record<string, PillDefinition> = {}
  for (const skeletonStep of skeleton.steps) {
    for (const pill of skeletonStep.pillDecisions) {
      if (!pillDefinitions[pill.decisionType]) {
        pillDefinitions[pill.decisionType] = pill
      }
    }
  }

  return {
    title: skeleton.title,
    description: skeleton.description,
    badge: skeleton.badge,
    pillDefinitions,
    steps: skeleton.steps.map((skeletonStep): Step => ({
      id: crypto.randomUUID(),
      heading: skeletonStep.heading,
      // StepPillRow stays thin — just the user's selection state. Display
      // data (question, options, picked, rationale) lives on the plan's
      // pillDefinitions map, looked up by decisionType at render time.
      pills: skeletonStep.pillDecisions.map((pill): StepPillRow => ({
        decisionType: pill.decisionType,
        selected: null,
        aiPicked: false,
      })),
      isComplete: false,
      // DP1.7.D — every step starts 'pending'. Phase B's step-1-only mode
      // flips step 1 to 'generating' immediately on submit; steps 2-N stay
      // 'pending' until the student commits via the Continue CTA (DP1.7.F)
      // or the alt "Generate this step" link (DP1.7.G).
      generationStatus: 'pending',
    })),
  }
}

// ----------------------------------------------------------------------------
// difficultyToModeId — maps the skeleton's production-aligned difficulty
// ("beginner" | "intermediate" | "advanced") onto the prototype's ModeId
// enum ("beginner-guided" | "intermediate" | "advanced-minimal"). Returns
// undefined when the difficulty is missing or unrecognized so callers can
// skip updating the pill rather than forcing a default that would shadow
// a genuine "default" origin.
// ----------------------------------------------------------------------------

function difficultyToModeId(difficulty: string | undefined): ModeId | undefined {
  switch (difficulty) {
    case 'beginner':
      return 'beginner-guided'
    case 'intermediate':
      return 'intermediate'
    case 'advanced':
      return 'advanced-minimal'
    default:
      return undefined
  }
}

// ----------------------------------------------------------------------------
// Phase B — DP1.7.D step-1-only mode (replaces DP1.5.F parallel fan-out)
// ----------------------------------------------------------------------------
//
// Why the rewrite: production student feedback (2026-04-25) reports Step 3+
// hallucinations on the live NextWork generator. Verified architectural
// cause: the prior pipeline ran every step's section-generator call in
// parallel against the outline only, with zero cross-step context. Step 4
// would invent commands that contradicted Step 1's choices. The fix is
// modular sequential generation — each step's prompt receives the rendered
// blocks of all prior steps as ground truth (see PriorStepContext +
// flattenBlocksToText). Step 1 fires automatically on submit; Steps 2-N
// wait for the student to commit via the Continue CTA (DP1.7.F) which
// calls triggerNextStep below.
//
// The two passes (Stage 1, then Stage 2 Firecrawl refresh) are preserved
// for step 1 so freshness-critical topics still benefit from Firecrawl
// without delaying first paint when stable. Pass 2 keeps generationStatus
// at 'ready' — only the blocks crossfade.

interface PhaseBStep1Input {
  plan: ActionPlan
  /** Accumulated findings per step, populated by the fireResearch onFinding
   *  callback. The orchestrator continues to fill this during Phase B so
   *  Pass 2 sees strictly more than Pass 1. */
  findingsByStep: Map<string, ResearchFinding[]>
  researchRun: ResearchRun
  signal: AbortSignal
  setStepBlocks: (stepId: string, blocks: ContentBlock[]) => void
  setStepGenerationStatus: (stepId: string, status: StepGenerationStatus) => void
}

async function runPhaseBStep1Only(input: PhaseBStep1Input): Promise<void> {
  const {
    researchRun,
    plan,
    findingsByStep,
    signal,
    setStepBlocks,
    setStepGenerationStatus,
  } = input
  if (plan.steps.length === 0) return
  const step1 = plan.steps[0]

  // eslint-disable-next-line no-console
  console.log('[Phase B] step 1 only — initial submit')

  // Flip lifecycle BEFORE awaiting research so the canvas can render the
  // shimmer treatment under step 1's heading immediately. Steps 2-N keep
  // their 'pending' status from skeletonToActionPlan.
  setStepGenerationStatus(step1.id, 'generating')

  await researchRun.stage1
  if (signal.aborted) return

  if (researchRun.freshnessCritical) {
    // Freshness-critical (OpenClaw / Claude SDK / "latest X") — wait for
    // Firecrawl before rendering anything so the student's first read is
    // live-web accurate. Slightly longer time-to-first-content is the
    // explicit tradeoff vs stale hallucinated commands.
    // eslint-disable-next-line no-console
    console.log('[Phase B] freshness-critical — delaying Pass 1 until Firecrawl lands')
    await researchRun.stage2
    if (signal.aborted) return
    await generateBlocksForStep({
      step: step1,
      stepIndex: 0,
      plan,
      findings: findingsByStep.get(step1.id) ?? [],
      priorSteps: [],
      signal,
      setStepBlocks,
      passNumber: 1,
    })
    if (signal.aborted) return
    setStepGenerationStatus(step1.id, 'ready')
    return
  }

  // Standard: Pass 1 on Stage 1, then Pass 2 on Stage 1+2 to refresh with
  // Firecrawl. Status flips to 'ready' after Pass 1 — Pass 2 just swaps the
  // blocks underneath without changing lifecycle.
  await generateBlocksForStep({
    step: step1,
    stepIndex: 0,
    plan,
    findings: findingsByStep.get(step1.id) ?? [],
    priorSteps: [],
    signal,
    setStepBlocks,
    passNumber: 1,
  })
  if (signal.aborted) return
  setStepGenerationStatus(step1.id, 'ready')

  await researchRun.stage2
  if (signal.aborted) return

  await generateBlocksForStep({
    step: step1,
    stepIndex: 0,
    plan,
    findings: findingsByStep.get(step1.id) ?? [],
    priorSteps: [],
    signal,
    setStepBlocks,
    passNumber: 2,
  })
}

// ----------------------------------------------------------------------------
// triggerNextStep — DP1.7.D module-level helper, fired by the Continue CTA
// (DP1.7.F) and the pending-step alt link (DP1.7.G). Generates a single step
// using ALL prior steps' rendered blocks as priorSteps context — the
// hallucination-killing structural change. Idempotent: bails if the target
// step is already 'generating' or 'ready'.
// ----------------------------------------------------------------------------

interface TriggerNextStepInput {
  plan: ActionPlan
  /** 0-based index of the step to generate (e.g. 1 for step 2). */
  stepIndex: number
  findingsByStep: Map<string, ResearchFinding[]>
  signal: AbortSignal
  setStepBlocks: (stepId: string, blocks: ContentBlock[]) => void
  setStepGenerationStatus: (stepId: string, status: StepGenerationStatus) => void
}

async function triggerNextStep(input: TriggerNextStepInput): Promise<void> {
  const {
    plan,
    stepIndex,
    findingsByStep,
    signal,
    setStepBlocks,
    setStepGenerationStatus,
  } = input
  if (stepIndex < 0 || stepIndex >= plan.steps.length) return
  const step = plan.steps[stepIndex]
  // Idempotency guard — avoids double-fires from rapid-tap CTA + alt link.
  if (
    step.generationStatus === 'generating' ||
    step.generationStatus === 'ready'
  ) {
    return
  }

  // Build priorSteps from every earlier step that has actually-generated
  // blocks. Steps without blocks are skipped (defensive — shouldn't happen in
  // the linear-commit flow, but if a sculpt blew away blocks mid-flight we
  // don't want to inject stale framing).
  const priorSteps: PriorStepContext[] = plan.steps
    .slice(0, stepIndex)
    .filter(
      (s): s is Step & { blocks: ContentBlock[] } =>
        Array.isArray(s.blocks) && s.blocks.length > 0,
    )
    .map((s) => ({ heading: s.heading, blocks: s.blocks! }))

  // eslint-disable-next-line no-console
  console.log(`[Phase B] triggered step ${stepIndex + 1}`)

  setStepGenerationStatus(step.id, 'generating')
  await generateBlocksForStep({
    step,
    stepIndex,
    plan,
    findings: findingsByStep.get(step.id) ?? [],
    priorSteps,
    signal,
    setStepBlocks,
    passNumber: 1,
  })
  if (signal.aborted) return
  setStepGenerationStatus(step.id, 'ready')
}

// ----------------------------------------------------------------------------
// generateBlocksForStep — DP1.5.I + DP1.7.D.
//
// Extracted so sculpting triggers (pill toggle, step add, chat message) can
// regenerate blocks for a single step without re-running the whole pipeline.
// DP1.7.D adds the priorSteps parameter and forwards it to generateStepBlocks
// for ground-truth grounding. Errors are logged but do not throw — the
// wiring layer is fire-and-forget.
// ----------------------------------------------------------------------------

interface PhaseBStepInput {
  step: Step
  stepIndex: number
  plan: ActionPlan
  findings: ResearchFinding[]
  /** DP1.7.D — chronological prior step context for hallucination-resistant
   *  continuation. Empty for step 1 and for sculpt regen of step 1; populated
   *  for triggerNextStep on steps 2..N. */
  priorSteps: PriorStepContext[]
  signal: AbortSignal
  setStepBlocks: (stepId: string, blocks: ContentBlock[]) => void
  /** Pass number — 1 for initial / sculpt-refresh, 2 for Firecrawl refresh.
   *  Used only for log telemetry; the generator call is identical. */
  passNumber: 1 | 2
}

async function generateBlocksForStep(input: PhaseBStepInput): Promise<void> {
  const {
    step,
    stepIndex,
    plan,
    findings,
    priorSteps,
    signal,
    setStepBlocks,
    passNumber,
  } = input
  const research = formatFindingsForPrompt(findings)
  const totalSteps = plan.steps.length

  const outline: OutlineContext = {
    title: plan.title,
    description: plan.description,
    allStepHeadings: plan.steps.map((s) => s.heading),
    currentStepIndex: stepIndex,
  }

  try {
    const blocks = await generateStepBlocks({
      stepId: step.id,
      stepHeading: step.heading,
      outline,
      research,
      priorSteps,
      signal,
    })
    if (signal.aborted) return
    setStepBlocks(step.id, blocks)
    // eslint-disable-next-line no-console
    console.log(
      `[Phase B] step ${stepIndex + 1}/${totalSteps} "${step.heading}" pass ${passNumber} — ${blocks.length} blocks (${findings.length} findings used, ${priorSteps.length} prior steps in context)`,
    )
  } catch (err) {
    if (signal.aborted) return
    // eslint-disable-next-line no-console
    console.warn(
      `[Phase B] step ${stepIndex + 1} "${step.heading}" pass ${passNumber} failed:`,
      err,
    )
  }
}

// ----------------------------------------------------------------------------
// getAffectedStepIds — DP1.5.I.
//
// Derives the step-id scope of a research intent so triggerSculpt can abort
// prior in-flight sculpts for the same step(s) and knows which steps to
// regenerate blocks for once research lands.
// ----------------------------------------------------------------------------

function getAffectedStepIds(intent: ResearchIntent): string[] {
  switch (intent.kind) {
    case 'initial-submit':
      return intent.steps.map((s) => s.id)
    case 'pill-toggle':
      return [intent.stepId]
    case 'step-add':
      return [intent.stepId]
    case 'chat-message':
      return intent.stepIds
  }
}

// ----------------------------------------------------------------------------
// runPhaseDDiagram — DP1.6.D.
//
// Phase D fires fire-and-forget after Phase A's setActionPlan(plan) lands. It
// flips diagramStatus to 'generating' immediately so the canvas can render
// the multi-state shimmer (DD.E), then POSTs to /api/diagram with the
// project title + description + step headings. On success, sets 'ready' with
// the data: URL. On failure (no key, content policy, network), sets 'failed'
// — the canvas renders nothing in the slot rather than showing an error.
//
// Aborts via the shared signal: a fresh runSkeleton call cancels any prior
// Phase D before starting a new one. Gemini Pro can take 20-25s, so the
// AbortController is the difference between "old diagram lands during new
// project" and "old call gets thrown away cleanly."
// ----------------------------------------------------------------------------

interface PhaseDInput {
  plan: ActionPlan
  signal: AbortSignal
  setDiagram: (status: DiagramStatus, url?: string) => void
}

async function runPhaseDDiagram(input: PhaseDInput): Promise<void> {
  const { plan, signal, setDiagram } = input

  // Flip to 'generating' synchronously so the shimmer can mount the moment
  // the canvas receives the new actionPlan — no flash of empty slot.
  setDiagram('generating')

  try {
    const response = await fetch('/api/diagram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: plan.title,
        description: plan.description,
        steps: plan.steps.map((s) => ({ heading: s.heading })),
        aspectRatio: '16:9',
        accentId: 'blue',
        background: 'dark',
      }),
      signal,
    })

    if (signal.aborted) return

    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.warn('[Phase D] /api/diagram returned', response.status)
      setDiagram('failed')
      return
    }

    const body = (await response.json()) as
      | { ok: true; dataUrl: string; model: string; latencyMs: number }
      | { ok: false; error: string; latencyMs: number }

    if (signal.aborted) return

    if (body.ok) {
      setDiagram('ready', body.dataUrl)
      // eslint-disable-next-line no-console
      console.log(
        `[Phase D] diagram ready in ${body.latencyMs}ms (model: ${body.model})`,
      )
    } else {
      // eslint-disable-next-line no-console
      console.warn('[Phase D] generator failed:', body.error)
      setDiagram('failed')
    }
  } catch (err) {
    if (signal.aborted) return
    // eslint-disable-next-line no-console
    console.warn('[Phase D] fetch threw:', err)
    setDiagram('failed')
  }
}

// ----------------------------------------------------------------------------
// App
// ----------------------------------------------------------------------------

export function App() {
  const engine = useShapingEngine()
  const {
    phase,
    intent,
    personal,
    personalOrigins,
    actionPlan,
    expandedStepId,
    chat,
    focusedStepId,
    setPhase,
    setPersonalPill,
    applyAiPersonalPills,
    setActionPlan,
    setStepBlocks,
    setStepGenerationStatus,
    setDiagram,
    expandStep,
    setStepPill,
    extendPillOptions,
    openChat,
    closeChat,
    addChatMessage,
    addStepMessage,
    enterFocus,
    leaveFocus,
    handleRemoveStep,
    appendStep,
    startMaterializing,
    addFinding,
    flagBranchCandidate,
    markFindingSurfaced,
    findings,
    reset,
  } = engine

  const [isAddingStep, setIsAddingStep] = useState(false)

  // DP1.8.A.1 — transient chat seed + pill context. Set when the student
  // taps "Talk it through →" on a StepPill row; cleared when the tray
  // closes so seeds don't accumulate across opens. Both pieces of state
  // are tied to the same lifecycle so they co-mutate via a tiny patch
  // helper rather than two parallel setters.
  const [chatSeedMessage, setChatSeedMessage] = useState<string | undefined>(
    undefined,
  )
  const [chatPillContext, setChatPillContext] = useState<
    { stepId: string; decisionType: string } | undefined
  >(undefined)

  // DP1.5.H — research activity indicator. True whenever at least one
  // fireResearch run is in flight (Phase R). The pulse lives in the canvas
  // top-right; App.tsx owns the flag, CanvasScreen renders the pulse.
  //
  // Implementation note: stored as a counter via useState callback so
  // concurrent research runs (e.g. initial-submit + a quick pill toggle
  // in DP1.5.I) compose — the pulse stays visible until every run has
  // resolved, not just the latest one.
  const [researchActiveCount, setResearchActiveCount] = useState(0)
  const isResearching = researchActiveCount > 0

  // Single AbortController shared across every Claude request in the
  // current generation "run" — Action Plan call plus all 5 step body
  // streams. Chat interrupt calls .abort() on this and a new controller
  // replaces it when the next run starts. Lives in a ref so writes don't
  // trigger re-renders (rerender-use-ref-transient-values).
  const runAbortRef = useRef<AbortController | null>(null)
  // DP1.5.I — per-step sculpt abort controllers. Rapid pill toggles on the
  // same step would otherwise stack concurrent research + block-regen runs;
  // this map lets triggerSculpt abort the prior run for each affected step
  // before spawning a new one. Never stored in useState (transient, writes
  // must not trigger re-renders).
  const sculptAbortRefs = useRef(new Map<string, AbortController>())

  // DP1.7.D — per-run accumulated findings keyed by step id. Persisted on the
  // App component (not local to runSkeleton) so triggerNextStep can read the
  // research bag for a step that the student commits to AFTER runSkeleton
  // returns. Replaced wholesale on each fresh runSkeleton; null between
  // submits. The orchestrator's onFinding callback continues to mutate this
  // map after runSkeleton returns since Phase R Stage 2 outlives Phase A.
  const findingsByStepRef = useRef<Map<string, ResearchFinding[]> | null>(null)

  // Stable refs to the live engine state so async handlers read the latest
  // actionPlan / personal / intent without capturing stale closures. The
  // handlers themselves depend only on the setter identities which are
  // stable across renders.
  const actionPlanRef = useRef<ActionPlan | null>(actionPlan)
  actionPlanRef.current = actionPlan
  const personalRef = useRef<PersonalPills>(personal)
  personalRef.current = personal
  const intentRef = useRef<string>(intent)
  intentRef.current = intent
  // Chat messages follow the same mirror pattern so handleChatSend stays
  // stable across chat ticks. Without this ref, chat.messages in the dep
  // array would recreate the callback on every message, churning Toolbar
  // props and defeating useCallback memoization.
  const chatMessagesRef = useRef<ChatMessage[]>(chat.messages)
  chatMessagesRef.current = chat.messages
  // DP1.8.A.1 — seed message ref so handleChatSend can fold the seed into
  // the forwarded transcript without depending on chatSeedMessage in its
  // deps array (which would churn the callback every time the seed
  // toggles between defined and undefined).
  const chatSeedMessageRef = useRef<string | undefined>(chatSeedMessage)
  chatSeedMessageRef.current = chatSeedMessage
  // Phase ref follows the same mirror pattern so handleChatSend can read the
  // live phase without being recreated on every phase flip. Using an effect
  // (not inline assignment) keeps the closure-visible value consistent with
  // React's commit semantics — the ref lands after the paint, which is when
  // an async user send actually reads it. Gap #2 phase-aware gating relies
  // on this being current at the moment the chat handler fires.
  const phaseRef = useRef<Phase>(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  // One session id per page load, threaded into every /api/research call
  // for cross-request correlation in the backend log. useState with lazy
  // init so the value is stable and doesn't regenerate on re-render.
  const [sessionId] = useState<string>(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  })

  // --------------------------------------------------------------------------
  // Claude drivers — split into two phases per Thread 5.
  // --------------------------------------------------------------------------
  //
  // Thread 5 splits what used to be a single runGeneration sweep into two
  // user-gated stages:
  //
  //   runSkeleton(intent, context)   — Generate (in Toolbar, Team B)
  //     phase: discovery -> materializing -> sculpting
  //     Produces: title, description, 5 step headings, pill decisions.
  //     Step bodies remain empty until the student taps Build.
  //
  //   runStepBodies(plan, intent)    — Build   (in ProjectHeader, Team C)
  //     phase: sculpting -> build -> generating -> complete
  //     Produces: streamed body paragraphs for every step in parallel.
  //     The 'build' phase is the brief commit handshake before the first
  //     chunk lands; as soon as any step stream begins we flip to
  //     'generating' so the chat tray pulse engages.
  //
  // Both stages share the same AbortController via runAbortRef so a chat
  // interrupt mid-sculpt or mid-build cancels the in-flight call and a
  // fresh run starts on the next user action.

  const runSkeleton = useCallback(
    async (
      nextIntent: string,
      contextMessages: ChatMessage[],
    ): Promise<void> => {
      // Replace any previous in-flight run.
      if (runAbortRef.current) {
        runAbortRef.current.abort()
      }
      const controller = new AbortController()
      runAbortRef.current = controller
      const { signal } = controller

      setPhase('materializing')

      // Fire research prefetch in parallel with the skeleton call. Non-blocking
      // by design — materialize-first is sacred (see feedback_materialization_first.md).
      // The cache is idempotent: same-intent prefetches (e.g. on chat refinement
      // that keeps the same intent string) are no-ops and don't burn quota.
      researchCache.prefetchResearch(nextIntent, sessionId)

      // Chat refinement regen (contextMessages non-empty) awaits research so
      // the reshaped skeleton benefits from grounded evidence. Initial
      // materialize (empty contextMessages) skips the await to preserve
      // <3s skeleton render — pretrained-only, the first skeleton never blocks.
      let researchContext: string | undefined
      if (contextMessages.length > 0) {
        try {
          const data = await researchCache.awaitResearch(nextIntent)
          if (signal.aborted) return
          const formatted = formatResearchForPrompt(data)
          researchContext = formatted.length > 0 ? formatted : undefined
        } catch (err) {
          if (signal.aborted) return
          console.warn('Research unavailable for skeleton regen', err)
        }
      }

      // ---- Action Plan skeleton (non-streaming, full object) -------------
      let skeleton: ActionPlanSkeleton
      try {
        const { system, user } = buildActionPlanPrompt({
          intent: nextIntent,
          personal: personalRef.current,
          researchContext,
        })
        const messages = [
          { role: 'user' as const, content: user },
          ...contextMessages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role, content: m.content })),
        ]
        const raw = await callClaude({
          system,
          messages: messages.length > 0
            ? messages
            : [{ role: 'user' as const, content: user }],
          signal,
        })
        if (signal.aborted) return
        skeleton = parseActionPlanSkeleton(raw)
      } catch (err) {
        if (signal.aborted) return
        console.error('Action plan call failed', err)
        // Reset phase back to discovery so the student isn't stuck staring
        // at the "Writing…" state forever when the proxy is down or Claude
        // rejects the request. The surface a user sees is: click Generate,
        // skeleton stems flash, immediately return to the Discovery entry
        // point. A future iteration can promote this to a toast with the
        // error message. Wrapped in startTransition per rerender-transitions.
        startTransition(() => {
          setPhase('discovery')
        })
        runAbortRef.current = null
        return
      }

      const plan = skeletonToActionPlan(skeleton)
      setActionPlan(plan)

      // Gap #1 AI pill application — Claude already proposes difficulty +
      // timeMinutes on the skeleton root but the previous build discarded
      // them. Consume them here so MetadataRow can render the "AI picked"
      // treatment with the badge. Missing / unrecognised values fall back
      // to undefined and the pill keeps its current origin (likely 'default'
      // on first generate, or whatever the student already confirmed).
      const aiPatch: Partial<PersonalPills> = {}
      const mappedMode = difficultyToModeId(skeleton.difficulty)
      if (mappedMode !== undefined) {
        aiPatch.mode = mappedMode
      }
      if (skeleton.timeMinutes !== undefined) {
        aiPatch.duration = timeMinutesToDurationId(skeleton.timeMinutes)
      }
      if (Object.keys(aiPatch).length > 0) {
        applyAiPersonalPills(aiPatch)
      }

      // DP1: advance to the single 'learning' state. The old model gated
      // this behind a Build tap → step body streaming. In the dynamic
      // pathway model, learning begins immediately after materialization.
      // Wrapped in startTransition per rerender-transitions so the skeleton
      // morph doesn't block input.
      startTransition(() => {
        setPhase('learning')
      })

      // DP1.5.F + DP1.7.D — Phase R + Phase B wiring.
      //
      // Phase R: fire the research orchestrator in the background. Stage 1
      // (Exa + Perplexity + maybe Context7) spins up immediately; Stage 2
      // (Firecrawl) chains off Stage 1's URL discovery. Findings stream
      // into the research store via addFinding and also accumulate in a
      // per-step map persisted on findingsByStepRef so triggerNextStep can
      // read it after runSkeleton returns.
      //
      // Phase B (DP1.7.D): step-1-only mode. runPhaseBStep1Only awaits
      // Stage 1 then generates ONLY step 1 — Pass 1 on Stage 1 findings,
      // Pass 2 after Firecrawl refreshes the corpus. Steps 2..N stay
      // 'pending' until the student commits via the Continue CTA / alt
      // link, which calls triggerNextStep with that step's full prior-
      // step rendered-block context. This is the structural fix for the
      // production hallucination cascade observed 2026-04-25.
      //
      // Both phases are fire-and-forget — runSkeleton returns as soon as
      // phase is set to 'learning'. The abort controller stays populated
      // on runAbortRef so the NEXT runSkeleton call can cancel Phase R/B
      // cleanly. (Previous DP1 behaviour nulled runAbortRef here; removed
      // because Phase B now owns the tail of the run.)
      const researchIntent: ResearchIntent = {
        kind: 'initial-submit',
        intent: nextIntent,
        steps: plan.steps.map((s) => ({ id: s.id, heading: s.heading })),
      }

      // DP1.7.D — store the per-step findings map on the App ref so
      // triggerNextStep can access it after runSkeleton returns. The
      // orchestrator's onFinding callback continues mutating it through
      // Stage 2, so a student who taps Continue mid-research benefits from
      // the latest accumulated bag.
      const findingsByStep = new Map<string, ResearchFinding[]>()
      findingsByStepRef.current = findingsByStep
      const researchRun = fireResearch(researchIntent, {
        onFinding: (finding) => {
          addFinding(finding)
          for (const stepId of finding.relatedStepIds) {
            const arr = findingsByStep.get(stepId) ?? []
            arr.push(finding)
            findingsByStep.set(stepId, arr)
          }
        },
        onBranchCandidate: flagBranchCandidate,
        signal,
      })

      // Flip the research indicator on until Stage 2 (the slowest stage)
      // settles. Stage 2 is chained off Stage 1 in the orchestrator so
      // awaiting it alone covers both phases. Uses a counter so concurrent
      // research runs compose cleanly (initial-submit + pill-toggle in
      // DP1.5.I both tick the same flag).
      setResearchActiveCount((c) => c + 1)
      void researchRun.stage2.finally(() => {
        setResearchActiveCount((c) => Math.max(0, c - 1))
      })

      // DP1.7.D — step-1-only mode. Steps 2..N stay 'pending' until the
      // student commits via the Continue CTA / alt link, which invoke
      // handleTriggerNextStep below. This is the structural fix for the
      // production hallucination cascade — see runPhaseBStep1Only header.
      void runPhaseBStep1Only({
        plan,
        findingsByStep,
        researchRun,
        signal,
        setStepBlocks,
        setStepGenerationStatus,
      })

      // DP1.6.D — Phase D architecture diagram. Fire-and-forget alongside
      // Phase R + Phase B. The Pro Gemini model runs ~20-25s per call, so
      // the canvas paints a multi-state shimmer (DD.E) over the slot during
      // the wait. Aborts via the same signal used by Phase B if the student
      // re-submits before the diagram lands.
      void runPhaseDDiagram({
        plan,
        signal,
        setDiagram,
      })
    },
    [
      addFinding,
      applyAiPersonalPills,
      flagBranchCandidate,
      sessionId,
      setActionPlan,
      setDiagram,
      setPhase,
      setStepBlocks,
      setStepGenerationStatus,
    ],
  )

  // --------------------------------------------------------------------------
  // DP1.5.I — triggerSculpt: fire Phase R research for a sculpt intent, then
  // regenerate blocks for the affected step(s). Shared by pill toggle, step
  // add, and (future) chat-message scoped intents. Runs fire-and-forget —
  // callers don't await the returned nothing.
  //
  // Per-step abort semantics: before spawning, any prior sculpt controller
  // for the same step is aborted. So five rapid toggles on step 2 produce
  // one completed research run (the last one), not five stacked runs.
  //
  // Timing model: sculpts skip the Pass 1 / Pass 2 split that initial
  // materialization uses. Reason — the student already has stale blocks on
  // screen and the prior DP1 instinct was to preserve continuity. A single
  // regen after Stage 1 + Stage 2 both settle (Firecrawl included) is
  // preferable to a two-step crossfade where the first pass would be
  // informed by outdated discovery results.
  // --------------------------------------------------------------------------

  const triggerSculpt = useCallback(
    (intent: ResearchIntent) => {
      const plan = actionPlanRef.current
      if (!plan) return

      const affectedStepIds = getAffectedStepIds(intent)

      // Abort any in-flight sculpts for these step(s).
      for (const stepId of affectedStepIds) {
        const prev = sculptAbortRefs.current.get(stepId)
        if (prev) prev.abort()
      }
      const controller = new AbortController()
      const { signal } = controller
      for (const stepId of affectedStepIds) {
        sculptAbortRefs.current.set(stepId, controller)
      }

      const findingsByStep = new Map<string, ResearchFinding[]>()
      const researchRun = fireResearch(intent, {
        onFinding: (finding) => {
          addFinding(finding)
          for (const stepId of finding.relatedStepIds) {
            const arr = findingsByStep.get(stepId) ?? []
            arr.push(finding)
            findingsByStep.set(stepId, arr)
          }
        },
        onBranchCandidate: flagBranchCandidate,
        signal,
      })

      // Research pulse — sculpt runs tick the same counter as initial submit
      // so the indicator stays lit through overlapping activity.
      setResearchActiveCount((c) => c + 1)
      void researchRun.stage2.finally(() => {
        setResearchActiveCount((c) => Math.max(0, c - 1))
      })

      // After both stages settle, regenerate blocks for affected steps with
      // the freshly-researched findings. Read the latest plan inside the
      // IIFE so concurrent step add/remove don't use a stale snapshot.
      void (async () => {
        try {
          await researchRun.stage1
          if (signal.aborted) return
          await researchRun.stage2
          if (signal.aborted) return

          const latestPlan = actionPlanRef.current
          if (!latestPlan) return

          const calls = affectedStepIds.map((stepId) => {
            const stepIndex = latestPlan.steps.findIndex((s) => s.id === stepId)
            if (stepIndex === -1) return Promise.resolve()
            const step = latestPlan.steps[stepIndex]
            const findings = findingsByStep.get(stepId) ?? []
            // DP1.7.D — sculpt regen passes priorSteps: []. Rationale:
            //   1. The step is already 'ready' with blocks on screen. Sculpt
            //      is changing THIS step's framing (pill / chat / step-add),
            //      not continuing from prior steps.
            //   2. Sculpting step 1 should not re-anchor on its own current
            //      blocks (that would freeze them); sculpting step 3 still
            //      reads the outline + research, and the prior-step grounding
            //      it needed was baked in when triggerNextStep first fired.
            //   3. NOTE: generationStatus is intentionally NOT mutated here —
            //      the step stays 'ready' across sculpt; only the blocks
            //      array swaps. This preserves the "step has been committed
            //      to" state in the lifecycle field.
            return generateBlocksForStep({
              step,
              stepIndex,
              plan: latestPlan,
              findings,
              priorSteps: [],
              signal,
              setStepBlocks,
              passNumber: 1,
            })
          })
          await Promise.allSettled(calls)
        } finally {
          // Clear the map entry only if we're still the latest controller
          // for the step — otherwise a newer sculpt's controller shouldn't
          // be evicted.
          for (const stepId of affectedStepIds) {
            if (sculptAbortRefs.current.get(stepId) === controller) {
              sculptAbortRefs.current.delete(stepId)
            }
          }
        }
      })()
    },
    [addFinding, flagBranchCandidate, setStepBlocks],
  )

  // --------------------------------------------------------------------------
  // DP1.7.D — handleTriggerNextStep: commit the next pending step.
  //
  // Wired by DP1.7.F's Continue CTA and DP1.7.G's pending-step alt link. Both
  // surfaces call this with the same target stepIndex; the helper guards
  // idempotently against double-fires inside triggerNextStep.
  //
  // Reuses the active runAbortRef signal so re-submitting a project mid-step-
  // generation cancels the in-flight Claude call cleanly. Reuses the live
  // findingsByStepRef so a step that the student commits to mid-research
  // benefits from whatever Stage 2 has surfaced by then.
  //
  // For DP1.7.D this callback is created but no consumer is wired yet —
  // DP1.7.F (Continue CTA) and DP1.7.G (pending alt link) plumb it through
  // CanvasScreen / StepCard props in their respective chunks.
  // --------------------------------------------------------------------------
  const handleTriggerNextStep = useCallback(
    (stepIndex: number) => {
      const plan = actionPlanRef.current
      if (!plan) return
      const findingsByStep = findingsByStepRef.current ?? new Map<string, ResearchFinding[]>()
      const signal = runAbortRef.current?.signal ?? new AbortController().signal
      void triggerNextStep({
        plan,
        stepIndex,
        findingsByStep,
        signal,
        setStepBlocks,
        setStepGenerationStatus,
      })
    },
    [setStepBlocks, setStepGenerationStatus],
  )

  // --------------------------------------------------------------------------
  // Public handlers wired to the screens
  // --------------------------------------------------------------------------

  const handleGenerate = useCallback(
    (value: string) => {
      // startMaterializing seeds intent + clears prior plan synchronously
      // so the canvas reveal animation can kick in before Claude responds.
      // runSkeleton flips to 'learning' as soon as the skeleton lands.
      startMaterializing(value)
      void runSkeleton(value, [])
    },
    [runSkeleton, startMaterializing],
  )

  // DP1.5.I — pill toggle + randomize handlers.
  //
  // Previously local to CanvasScreen. Lifted to App so they can read the
  // live plan via actionPlanRef AND fire research re-refresh through
  // triggerSculpt. setStepPill still flips engine state synchronously so
  // the pill UI updates immediately; research + block regen run in the
  // background behind the research pulse.
  //
  // If the newly-picked option equals the currently-selected option we
  // skip the sculpt — no meaningful change, no need to burn research
  // budget re-regenerating identical blocks.

  const handleStepPickPill = useCallback(
    (stepId: string, decisionType: string, selected: string) => {
      const plan = actionPlanRef.current
      if (!plan) return
      const step = plan.steps.find((s) => s.id === stepId)
      if (!step) return
      const existingPill = step.pills.find((p) => p.decisionType === decisionType)
      const oldSelection = existingPill?.selected ?? null

      setStepPill(stepId, decisionType, selected, false)

      if (oldSelection === selected) return

      triggerSculpt({
        kind: 'pill-toggle',
        stepId,
        stepHeading: step.heading,
        decisionType,
        newSelection: selected,
        oldSelection,
      })
    },
    [setStepPill, triggerSculpt],
  )

  // DP1.5.J — branch chip handlers.
  //
  // handleBranchApply: student tapped "Switch this step" on a branch chip.
  //   Mark the finding surfaced so the chip dismisses, then fire a scoped
  //   chat-message sculpt — the finding's content becomes the topic, and
  //   triggerSculpt's existing machinery handles the research re-fire +
  //   block regen for just that step.
  //
  // handleBranchDismiss: student tapped "Dismiss". Mark the finding
  //   surfaced (chip hides) but leave the finding in the store so the
  //   next section-generator pass still benefits from the research.
  const handleBranchApply = useCallback(
    (finding: ResearchFinding, stepId: string) => {
      markFindingSurfaced(finding.id, 'chip')

      const plan = actionPlanRef.current
      if (!plan) return
      const step = plan.steps.find((s) => s.id === stepId)
      if (!step) return

      // Use the branch summary as the chat-message topic so the section
      // generator prompt gets a concrete "consider this alternative" hint
      // rather than just a raw snippet dump.
      const topSnippet = finding.snippets[0]
      const topic =
        topSnippet?.content?.trim() ||
        topSnippet?.title ||
        'Reconsider this step given the research.'

      triggerSculpt({
        kind: 'chat-message',
        topic,
        stepIds: [stepId],
        projectIntent: intentRef.current,
      })
    },
    [markFindingSurfaced, triggerSculpt],
  )

  const handleBranchDismiss = useCallback(
    (findingId: string) => {
      markFindingSurfaced(findingId, 'chip')
    },
    [markFindingSurfaced],
  )

  const handleStepRandomizePill = useCallback(
    (stepId: string, decisionType: string) => {
      const plan = actionPlanRef.current
      if (!plan) return
      const step = plan.steps.find((s) => s.id === stepId)
      if (!step) return
      const definition = plan.pillDefinitions[decisionType]
      const picked = definition?.picked ?? decisionType
      const existingPill = step.pills.find((p) => p.decisionType === decisionType)
      const oldSelection = existingPill?.selected ?? null

      setStepPill(stepId, decisionType, picked, true)

      if (oldSelection === picked) return

      triggerSculpt({
        kind: 'pill-toggle',
        stepId,
        stepHeading: step.heading,
        decisionType,
        newSelection: picked,
        oldSelection,
      })
    },
    [setStepPill, triggerSculpt],
  )

  // DP1.8.A.2 — pill escape hatch entry point. The "Talk it through →"
  // link on each StepPill row hands off to this handler with its step id
  // and decision type. We build a system-style seed message that names
  // the decision + options + step heading so the assistant can walk
  // through trade-offs, and instruct it to suffix any fourth-option
  // suggestion with a detectable envelope (matched in ChatTray by
  // ADD_OPTION_REGEX) so the inline "Add as option" button can surface.
  const handleAskAboutPill = useCallback(
    (stepId: string, decisionType: string) => {
      const plan = actionPlanRef.current
      if (!plan) return
      const stepIndex = plan.steps.findIndex((s) => s.id === stepId)
      if (stepIndex === -1) return
      const step = plan.steps[stepIndex]
      const definition = plan.pillDefinitions[decisionType]
      if (!step || !definition) return

      const stepNumber = (stepIndex + 1).toString().padStart(2, '0')
      const optionList = definition.options.join(' / ')
      const seed = [
        `You're choosing between ${optionList} for ${definition.question} on Step ${stepNumber}: '${step.heading}'.`,
        '- Walk through the trade-offs concisely (3 sentences max).',
        '- If the student proposes a new option that fits, end your response with: "I\'d suggest adding **OPTION_NAME** as a fourth option here." (exact format — the canvas detects this phrase to surface an Add-as-option button.)',
      ].join('\n')

      setChatSeedMessage(seed)
      setChatPillContext({ stepId, decisionType })
      openChat()
    },
    [openChat],
  )

  // DP1.8.A.3 — accept a chat-proposed fourth option. Dispatches the
  // EXTEND_PILL_OPTIONS reducer action (appends to options + selects on
  // the originating step in one pass) and closes the tray so the student
  // returns to the canvas with the new selection visible. Closing also
  // clears the seed via handleCloseChat below.
  const handleAddPillOption = useCallback(
    (stepId: string, decisionType: string, newOption: string) => {
      extendPillOptions(stepId, decisionType, newOption)
      closeChat()
      setChatSeedMessage(undefined)
      setChatPillContext(undefined)

      // Mirror handleStepPickPill's sculpt re-fire so the canvas updates the
      // step body to reflect the new pill choice. The plan is read from the
      // ref because extendPillOptions just dispatched a reducer update —
      // actionPlanRef.current is the pre-dispatch snapshot, but the step
      // heading we need for the sculpt context is unchanged either way.
      const plan = actionPlanRef.current
      if (!plan) return
      const step = plan.steps.find((s) => s.id === stepId)
      if (!step) return
      const existingPill = step.pills.find(
        (p) => p.decisionType === decisionType,
      )
      const oldSelection = existingPill?.selected ?? null
      if (oldSelection === newOption) return
      triggerSculpt({
        kind: 'pill-toggle',
        stepId,
        stepHeading: step.heading,
        decisionType,
        newSelection: newOption,
        oldSelection,
      })
    },
    [extendPillOptions, closeChat, triggerSculpt],
  )

  // DP1.8.A.1 — wrap closeChat so the seed + pill context are cleared
  // when the tray collapses. Without this the next time the tray opens
  // (e.g. via the regular Chat pill in the toolbar) the stale seed would
  // still render.
  const handleCloseChat = useCallback(() => {
    closeChat()
    setChatSeedMessage(undefined)
    setChatPillContext(undefined)
  }, [closeChat])


  // "+ Add step" — calls Claude for a single new step and appends it.
  // Optional `topic` shapes the step around the student's words (used by
  // chat-driven append in DP1.E). Without a topic, Claude picks a natural
  // next step for the project.
  const handleAddStep = useCallback(async (topic?: string) => {
    const plan = actionPlanRef.current
    if (!plan || isAddingStep) return
    setIsAddingStep(true)

    const stepSummary = plan.steps
      .map((s, i) => `${i + 1}. ${s.heading}`)
      .join('\n')

    const system = [
      'You are the NextWork project shaper. The student has an existing project outline and wants to add one more step at the end.',
      '',
      'Return ONLY a single JSON object with {heading, pillDecisions}. Same schema as each step in the original skeleton:',
      '- heading: 2-6 words, imperative form',
      '- pillDecisions: 0-2 entries, each with {decisionType, question, optionNames (exactly 3), picked, rationale}',
      '',
      'Do NOT repeat a step that already exists. The new step should be a natural extension of the project.',
      'No prose before or after. No code fences. Just the JSON object.',
    ].join('\n')

    const topicLine = topic
      ? `The student asked to add a step about: "${topic}". Shape the step around this request.`
      : 'Add one more step that is a natural extension.'

    const user = [
      `Project: ${plan.title}`,
      `Intent: ${intentRef.current}`,
      '',
      'Current steps:',
      stepSummary,
      '',
      `${topicLine} Return {heading, pillDecisions} only.`,
    ].join('\n')

    try {
      const raw = await callClaude({
        system,
        messages: [{ role: 'user', content: user }],
        maxTokens: 500,
      })

      const stripped = raw.trim()
      const objStart = stripped.indexOf('{')
      const objEnd = stripped.lastIndexOf('}')
      if (objStart === -1 || objEnd === -1) throw new Error('No JSON in response')
      const parsed = JSON.parse(stripped.slice(objStart, objEnd + 1))

      const heading =
        typeof parsed.heading === 'string' && parsed.heading.length > 0
          ? parsed.heading
          : typeof parsed.title === 'string' && parsed.title.length > 0
            ? parsed.title
            : 'New step'

      const pillDecisions = parsePillDecisions(parsed.pillDecisions)

      const newStep: Step = {
        id: crypto.randomUUID(),
        heading,
        pills: pillDecisions.map((pill): StepPillRow => ({
          decisionType: pill.decisionType,
          selected: null,
          aiPicked: false,
        })),
        isComplete: false,
      }

      const updatedDefs = { ...plan.pillDefinitions }
      for (const pill of pillDecisions) {
        if (!updatedDefs[pill.decisionType]) {
          updatedDefs[pill.decisionType] = pill
        }
      }
      setActionPlan({
        ...plan,
        steps: [...plan.steps, newStep],
        pillDefinitions: updatedDefs,
      })

      // DP1.5.I — fire research + generate blocks for the new step. New
      // step initially renders shimmer under its heading; triggerSculpt's
      // pipeline replaces it with real content once Stage 1 + 2 settle.
      triggerSculpt({
        kind: 'step-add',
        stepId: newStep.id,
        stepHeading: newStep.heading,
        projectIntent: intentRef.current,
      })
    } catch (err) {
      console.error('Add step failed', err)
    } finally {
      setIsAddingStep(false)
    }
  }, [isAddingStep, appendStep, setActionPlan, triggerSculpt])

  // Chat send — DP1 simplified contract.
  //
  // Before DP1: chat gated regeneration on phase (build/generating deferred,
  // sculpting/complete regenerated with body preservation). With bodies
  // gone, the gate collapses: chat always fires an ack + always triggers
  // a skeleton regeneration.
  //
  // DP1.E (next chunk) will wire an "add a step" intent detector so some
  // chat messages append a single step instead of regenerating the whole
  // plan. For now it's regen-only.
  const handleChatSend = useCallback(
    (text: string, isInterrupt: boolean) => {
      void isInterrupt // reserved — runSkeleton handles its own abort below
      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: text,
      }
      addChatMessage(userMessage)

      // Build the message list we want to forward to Claude. addChatMessage
      // dispatches synchronously, but the ref still holds the pre-dispatch
      // snapshot — append the new message manually to keep the forwarded
      // transcript current.
      // DP1.8.A.1 — when the tray was opened via a "Talk it through →"
      // pill seed, prepend the seed as a synthetic user-role context
      // message so Claude sees the decision being discussed without
      // requiring a wire-format change to the chat ack endpoint. Role
      // 'user' (not 'assistant') is deliberate — the seed is context the
      // student would have typed if they were spelling out which pill
      // they're asking about.
      const seed = chatSeedMessageRef.current
      const seedPrefix: ChatMessage[] = seed
        ? [
            {
              id: `seed-${Date.now()}`,
              role: 'user',
              content: seed,
            },
          ]
        : []
      const forwarded = [
        ...seedPrefix,
        ...chatMessagesRef.current,
        userMessage,
      ]

      // Only run the chat flow when we have an intent (student is on the
      // canvas). If intent is empty we just append the user bubble and let
      // the next Generate fire the real call.
      if (intentRef.current.length === 0) {
        return
      }

      const currentPhase = phaseRef.current

      // Ack always fires — feedback in the tray regardless of whether the
      // canvas regenerates. Runs independently of runSkeleton; a failed ack
      // is non-fatal.
      void (async () => {
        try {
          const ack = await fetchChatAck(
            {
              userMessage: text,
              currentIntent: intentRef.current,
              currentTitle: actionPlanRef.current?.title ?? '',
              currentPhase,
              previousMessages: forwarded,
            },
            runAbortRef.current?.signal,
          )
          if (ack.length === 0) return
          addChatMessage({
            id: `msg-${Date.now()}-assistant`,
            role: 'assistant',
            content: ack,
          })
        } catch (err) {
          if (err instanceof Error && err.name !== 'AbortError') {
            console.error('Chat ack failed', err)
          }
        }
      })()

      // DP1.E: detect "add a step" intent before falling through to regen.
      const addStepMatch = text.match(
        /^(?:add\s+(?:a\s+)?(?:another\s+)?step|i\s+want\s+to\s+learn)\s*(.*)/i,
      )
      if (addStepMatch) {
        const topic = addStepMatch[1]?.trim() || undefined
        void handleAddStep(topic)
        return
      }

      // Default: full skeleton regeneration.
      void runSkeleton(intentRef.current, forwarded)
    },
    [addChatMessage, runSkeleton, handleAddStep],
  )

  // Highway focused-step handlers — Chunk B wires the cut, Chunk C replaces it
  // with a morph, Chunk D upgrades onAskStep to step-scoped skeleton regen.
  const handleRefineStep = useCallback(
    (stepId: string) => {
      if (!actionPlanRef.current) return
      enterFocus(stepId)
    },
    [enterFocus],
  )

  const handleAskStep = useCallback(
    (stepId: string, message: string) => {
      // Chunk B stub: append to stepChats history so re-entering the step
      // remembers the turn. Chunk D routes this through dispatchStepChat
      // which regenerates the step body in-place.
      addStepMessage(stepId, {
        id: `step-msg-${Date.now()}-user`,
        role: 'user',
        content: message,
      })
      // eslint-disable-next-line no-console
      console.log('[ask step stub]', stepId, message)
    },
    [addStepMessage],
  )

  // Arrow-key traversal handlers for Highway — compute adjacent step ids
  // from the current plan. Guarded against no-plan edge cases.
  const focusedStepAdjacency = useMemo(() => {
    const plan = actionPlan
    const id = focusedStepId
    if (!plan || !id) return { prevId: null, nextId: null }
    const idx = plan.steps.findIndex((s) => s.id === id)
    if (idx < 0) return { prevId: null, nextId: null }
    return {
      prevId: idx > 0 ? plan.steps[idx - 1].id : null,
      nextId: idx < plan.steps.length - 1 ? plan.steps[idx + 1].id : null,
    }
  }, [actionPlan, focusedStepId])

  const handleFocusPrev = useCallback(() => {
    if (focusedStepAdjacency.prevId) enterFocus(focusedStepAdjacency.prevId)
  }, [enterFocus, focusedStepAdjacency.prevId])

  const handleFocusNext = useCallback(() => {
    if (focusedStepAdjacency.nextId) enterFocus(focusedStepAdjacency.nextId)
  }, [enterFocus, focusedStepAdjacency.nextId])

  useFocusNavigation({
    enabled: phase === 'focused',
    onExit: leaveFocus,
    onPrev: handleFocusPrev,
    onNext: handleFocusNext,
  })

  // AnimatePresence with mode="popLayout" allows shared-element layoutId
  // transitions across the Discovery -> Canvas morph. mode="wait" would
  // unmount the exiting screen fully before mounting the new one, which
  // breaks Motion's layout continuity tracking. popLayout lets both
  // coexist briefly so the Toolbar's layoutIds can interpolate across
  // the phase swap.
  //
  // Toolbar is mounted OUTSIDE the AnimatePresence block so it survives
  // every phase transition. That preserves its draft text, local
  // expansion state, and — critically for I8 — the Claude stream
  // AbortController ref lives one level up in this component. The
  // Toolbar is the persistent bottom-docked pill / input / chat sheet,
  // contextually morphing based on `phase`:
  //   - Discovery phase -> "What do you want to build?" pill, taps open
  //     a text input (ToolbarInput) that calls onGenerate.
  //   - Everything else -> intent-reflecting pill that opens ChatTray
  //     (now repurposed as the Canvas expanded drawer) on tap.
  //
  // ChatTray itself is rendered INSIDE Toolbar (Canvas mode) — it's no
  // longer a sibling of the screens. Its props are forwarded through
  // Toolbar so App remains the single source of Claude wiring.
  // Pick the active screen by phase. Discovery and Focused have their own
  // dedicated surfaces; everything else falls through to CanvasScreen.
  // mode="popLayout" keeps the shared layoutId morph window open between
  // Canvas and Highway (Chunk C will exploit this; Chunk B just cuts).
  let screen: ReactNode
  if (phase === 'discovery') {
    screen = (
      <DiscoveryScreen
        key="discovery"
        onSearchCardSubmit={handleGenerate}
      />
    )
  } else if (phase === 'focused' && actionPlan && focusedStepId) {
    screen = (
      <HighwayScreen
        key="highway"
        actionPlan={actionPlan}
        focusedStepId={focusedStepId}
        onFocusStep={enterFocus}
        onExit={leaveFocus}
        onAskStep={handleAskStep}
        setStepPill={setStepPill}
      />
    )
  } else {
    screen = (
      <CanvasScreen
        key="canvas"
        intent={intent}
        phase={phase}
        personal={personal}
        personalOrigins={personalOrigins}
        actionPlan={actionPlan}
        expandedStepId={expandedStepId}
        setPhase={setPhase}
        setPersonalPill={setPersonalPill}
        expandStep={expandStep}
        onPickPill={handleStepPickPill}
        onRandomizePill={handleStepRandomizePill}
        onBack={reset}
        onRefineStep={handleRefineStep}
        onRemoveStep={handleRemoveStep}
        onAddStep={handleAddStep}
        isAddingStep={isAddingStep}
        isResearching={isResearching}
        findings={findings}
        onBranchApply={handleBranchApply}
        onBranchDismiss={handleBranchDismiss}
        onTriggerStep={handleTriggerNextStep}
        onAskAboutPill={handleAskAboutPill}
      />
    )
  }

  return (
    <>
      <AnimatePresence mode="popLayout">{screen}</AnimatePresence>
      {/* Toolbar suppressed during discovery (DiscoveryScreen owns its own
          search card — nav bar was redundant) and focused (HighwayDock takes
          over as the persistent bottom affordance). Still mounted across
          materializing/learning so the canvas-mode chat dock is available. */}
      {phase !== 'focused' && phase !== 'discovery' ? (
        <Toolbar
          phase={phase}
          intent={intent}
          isGenerating={selectIsGenerating(phase)}
          onGenerate={handleGenerate}
          chatMessages={chat.messages}
          isChatOpen={chat.isOpen}
          onOpenChat={openChat}
          onCloseChat={handleCloseChat}
          onChatSend={handleChatSend}
          chatSeedMessage={chatSeedMessage}
          chatPillContext={chatPillContext}
          onAddPillOption={handleAddPillOption}
        />
      ) : null}
      <ResearchDebugPanel />
    </>
  )
}
