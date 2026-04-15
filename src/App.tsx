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
import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { DiscoveryScreen } from '@/screens/DiscoveryScreen'
import { CanvasScreen } from '@/screens/CanvasScreen'
import { Toolbar } from '@/components/Toolbar'
import { useShapingEngine, selectIsGenerating } from '@/hooks/useShapingEngine'
import { callClaude, streamClaude } from '@/lib/claude'
import {
  buildActionPlanPrompt,
  parseActionPlanSkeleton,
  timeMinutesToDurationId,
  type ActionPlanSkeleton,
} from '@/lib/actionPlan'
import { fetchResearch, formatResearchForPrompt, type ResearchMode } from '@/lib/research'

// Research mode is read from ?mode=exa-only on first load and pinned for the
// session. No reactivity to URL changes — switching modes requires a reload,
// which is the cheapest A/B for the demo.
function getResearchMode(): ResearchMode {
  if (typeof window === 'undefined') return 'full'
  const params = new URLSearchParams(window.location.search)
  return params.get('mode') === 'exa-only' ? 'exa-only' : 'full'
}
const RESEARCH_MODE: ResearchMode = getResearchMode()
import {
  buildStepBodyPrompt,
  buildInpaintingPrompt,
} from '@/lib/inpainting'
import { fetchChatAck } from '@/lib/chatAck'
import type {
  ActionPlan,
  ChatMessage,
  InpaintingAction,
  Phase,
  PersonalPills,
  Step,
  StepPillRow,
} from '@/lib/state'
import type { ModeId } from '@/lib/copy'

// ----------------------------------------------------------------------------
// Skeleton -> ActionPlan conversion
// ----------------------------------------------------------------------------
//
// The prompt returns a skeleton (title + steps + pill decision slugs). The
// reducer wants a full ActionPlan (steps with empty body, pills, isComplete
// false). One pure function, kept at module level per rerender-no-inline-
// components so its identity is stable across renders even though App only
// calls it inside event handlers.

function skeletonToActionPlan(skeleton: ActionPlanSkeleton): ActionPlan {
  return {
    title: skeleton.title,
    description: skeleton.description,
    badge: skeleton.badge,
    steps: skeleton.steps.map((skeletonStep): Step => ({
      id: skeletonStep.id,
      heading: skeletonStep.heading,
      body: '',
      pills: skeletonStep.pillDecisions.map((decisionType): StepPillRow => ({
        decisionType,
        selected: null,
        aiPicked: false,
      })),
      inpainting: null,
      isComplete: false,
    })),
  }
}

// ----------------------------------------------------------------------------
// mergeBodiesByStepId — Gap #2 body preservation.
//
// When a chat-driven refinement triggers runSkeleton again, the new skeleton
// arrives with empty step bodies (Claude only writes bodies during the second
// pass). If the student has already generated real content, replacing the
// plan wholesale wipes everything they just read. This helper carries
// forward bodies from old steps whose ids still exist in the new plan AND
// had finished streaming (isComplete), so a refinement preserves the canvas
// content while the student tees up the next Build.
//
// Rules:
//   - Match by step.id. If the new skeleton restructured ids, the old bodies
//     don't carry (correct — the shape changed).
//   - Only merge when the OLD step was `isComplete` AND has a non-empty body.
//     Partial in-flight streams are discarded — the chat context that caused
//     the regeneration implies they were about to be replaced anyway.
//   - Pills on the new plan keep the new plan's pills. Only `body` and
//     `isComplete` flow from the old step.
//
// Kept at module level per rerender-no-inline-components / rendering-hoist-jsx
// so the function identity is stable and it can be tested in isolation.
// ----------------------------------------------------------------------------

function mergeBodiesByStepId(
  newPlan: ActionPlan,
  oldPlan: ActionPlan,
): ActionPlan {
  return {
    ...newPlan,
    steps: newPlan.steps.map((newStep) => {
      const oldStep = oldPlan.steps.find((s) => s.id === newStep.id)
      if (oldStep && oldStep.isComplete && oldStep.body.length > 0) {
        return { ...newStep, body: oldStep.body, isComplete: true }
      }
      return newStep
    }),
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
    setPhase,
    setPersonalPill,
    applyAiPersonalPills,
    setActionPlan,
    expandStep,
    setStepPill,
    startInpainting,
    appendStepBodyChunk,
    stepBodyComplete,
    inpaintingComplete,
    openChat,
    closeChat,
    addChatMessage,
    startMaterializing,
    reset,
  } = engine

  // Single AbortController shared across every Claude request in the
  // current generation "run" — Action Plan call plus all 5 step body
  // streams. Chat interrupt calls .abort() on this and a new controller
  // replaces it when the next run starts. Lives in a ref so writes don't
  // trigger re-renders (rerender-use-ref-transient-values).
  const runAbortRef = useRef<AbortController | null>(null)

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

  // Research status surfaced in the Toolbar's "Writing…" chip during the
  // research fan-out phase. Null when no research is in flight. Cycles
  // through per-tool labels while fetchResearch runs — the cadence is an
  // illusion of progress since the backend returns all three tools at
  // once, but it's honest enough for the demo. Real SSE per-tool
  // streaming is a follow-up.
  const [researchStatus, setResearchStatus] = useState<string | null>(null)
  chatMessagesRef.current = chat.messages
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

      // ---- Research fan-out (Exa + Perplexity + Firecrawl) -------------
      // Feeds Claude grounded evidence before the skeleton prompt. A failure
      // here is non-fatal — the skeleton call falls back to zero-research
      // mode so the student still gets an outline (just the pre-research
      // quality level).
      let researchContext = ''
      const labels =
        RESEARCH_MODE === 'exa-only'
          ? ['Checking Exa']
          : ['Checking Exa', 'Synthesising with Perplexity', 'Extracting with Firecrawl']
      let labelIdx = 0
      setResearchStatus(labels[0])
      const statusTimer = setInterval(() => {
        labelIdx = (labelIdx + 1) % labels.length
        setResearchStatus(labels[labelIdx])
      }, 1500)

      try {
        const research = await fetchResearch(nextIntent, {
          mode: RESEARCH_MODE,
          signal,
        })
        researchContext = formatResearchForPrompt(research)
      } catch (err) {
        if (!signal.aborted) {
          console.warn('Research fan-out failed — continuing without context', err)
        }
      } finally {
        clearInterval(statusTimer)
        setResearchStatus(null)
      }

      if (signal.aborted) return

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

      let plan = skeletonToActionPlan(skeleton)

      // Gap #2 body preservation — when the student refined via chat, the new
      // skeleton replaces the old plan but the existing generated content
      // should stay visible through the regeneration. Only steps that were
      // already complete (isComplete + body.length > 0) carry forward, and
      // only when their id still exists in the new plan. Pills on the new
      // plan are never overridden — only body + isComplete flow from the
      // old step.
      const previousPlan = actionPlanRef.current
      if (previousPlan) {
        plan = mergeBodiesByStepId(plan, previousPlan)
      }

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

      // Stop at sculpting — the student must tap Build to commit and
      // trigger runStepBodies. rerender-transitions: wrap the phase flip
      // in startTransition so the skeleton -> sculpting morph doesn't
      // block input.
      startTransition(() => {
        setPhase('sculpting')
      })
      runAbortRef.current = null
    },
    [applyAiPersonalPills, setActionPlan, setPhase],
  )

  const runStepBodies = useCallback(
    async (plan: ActionPlan, nextIntent: string): Promise<void> => {
      // Replace any previous in-flight run — a Build tap while a skeleton
      // or earlier Build is still streaming starts fresh.
      if (runAbortRef.current) {
        runAbortRef.current.abort()
      }
      const controller = new AbortController()
      runAbortRef.current = controller
      const { signal } = controller

      // Brief 'build' handshake before the first chunk lands. Visual
      // purpose: the BuildButton reads 'Building…' while step cards
      // prepare to receive their first byte. As soon as any stream
      // begins writing we advance to 'generating' so the chat tray pulse
      // engages.
      //
      // Both phase flips wrapped in startTransition (rerender-transitions):
      // handleBuild wraps the outer dispatch but the `await` boundaries in
      // this async function escape the outer transition, so each setPhase
      // after a microtask tick needs its own startTransition call.
      startTransition(() => setPhase('build'))

      // ---- Parallel step body streams ------------------------------------
      //
      // async-parallel: fire all N streams with Promise.all instead of
      // awaiting each in sequence. Each stream:
      //   - Builds its prompt from the shared plan + its own step.
      //   - Reads chunks via streamClaude's async generator.
      //   - Writes chunks into the reducer as they arrive.
      //   - Marks the step complete on clean end.
      startTransition(() => setPhase('generating'))

      await Promise.all(
        plan.steps.map(async (step) => {
          if (signal.aborted) return
          try {
            const { system, user } = buildStepBodyPrompt({
              plan,
              step,
              personal: personalRef.current,
              intent: nextIntent,
            })
            const iterator = streamClaude({
              system,
              messages: [{ role: 'user', content: user }],
              signal,
            })
            for await (const chunk of iterator) {
              if (signal.aborted) return
              appendStepBodyChunk(step.id, chunk)
            }
            if (signal.aborted) return
            stepBodyComplete(step.id)
          } catch (err) {
            if (signal.aborted) return
            console.error(`Step ${step.id} stream failed`, err)
          }
        }),
      )

      if (signal.aborted) return
      startTransition(() => setPhase('complete'))
      runAbortRef.current = null
    },
    [appendStepBodyChunk, setPhase, stepBodyComplete],
  )

  // --------------------------------------------------------------------------
  // Public handlers wired to the screens
  // --------------------------------------------------------------------------

  const handleGenerate = useCallback(
    (value: string) => {
      // startMaterializing seeds intent + clears prior plan synchronously
      // so the canvas reveal animation can kick in before Claude responds.
      // runSkeleton stops at sculpting — the student must tap Build to
      // commit and stream step bodies.
      startMaterializing(value)
      void runSkeleton(value, [])
    },
    [runSkeleton, startMaterializing],
  )

  // Build click handler — wired to ProjectHeader's BuildButton via
  // CanvasScreen. Reads the live plan from the ref mirror so it can't
  // capture a stale snapshot, then kicks off runStepBodies. The phase
  // transition to 'build' happens inside runStepBodies itself. Wrapping
  // the outer dispatch in startTransition keeps the button's tap feedback
  // snappy even if React is mid-reconciliation.
  const handleBuild = useCallback(() => {
    const currentPlan = actionPlanRef.current
    if (!currentPlan) return
    startTransition(() => {
      void runStepBodies(currentPlan, intentRef.current)
    })
  }, [runStepBodies])

  // Chat send — Gap #2 rewrites this to be ADDITIVE rather than destructive.
  // Previously a chat message during build/generating aborted the in-flight
  // body stream and replaced the skeleton, wiping all generated content.
  // The new contract:
  //
  //   - The chat ack always fires (so the student always gets a response in
  //     the tray). The ack prompt is phase-aware: during build/generating
  //     it acknowledges the deferral; during sculpting/complete it
  //     acknowledges the pill/structure change.
  //
  //   - runSkeleton is GATED by phase:
  //       • 'build' or 'generating' → do NOT regenerate. The current stream
  //         keeps running to completion. The chat context is in
  //         chat.messages so the NEXT runSkeleton (from the next Build tap,
  //         or a sculpting/complete-phase chat) will pick it up.
  //       • 'sculpting' or 'complete' → regenerate normally. Body
  //         preservation (mergeBodiesByStepId in runSkeleton) keeps existing
  //         content visible while the new skeleton lands, so refinement
  //         feels additive.
  //
  // Gating predicate is a simple union of phases so adding an orthogonal
  // clause later (e.g. screen === 'discovery' once ChatTray hoists to
  // persistent chrome) stays a one-liner.
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
      const forwarded = [...chatMessagesRef.current, userMessage]

      // Only run the chat flow when we have an intent (student is on the
      // canvas). If intent is empty we just append the user bubble and let
      // the next Generate fire the real call.
      if (intentRef.current.length === 0) {
        return
      }

      const currentPhase = phaseRef.current

      // Ack always fires — feedback in the tray regardless of whether the
      // canvas regenerates. Prompt copy adjusts based on phase so a deferred
      // refinement reads as a promise, not a lie. Runs independently of
      // runSkeleton; a failed ack is non-fatal.
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

      // Phase gate — defer regeneration during mid-stream phases. The ack
      // copy is responsible for explaining this to the student.
      if (currentPhase === 'build' || currentPhase === 'generating') {
        return
      }

      // Safe to regenerate. In 'sculpting' there are no bodies to lose; in
      // 'complete' body preservation keeps existing content visible through
      // the skeleton swap.
      void runSkeleton(intentRef.current, forwarded)
    },
    [addChatMessage, runSkeleton],
  )

  // Inpainting — one step at a time, full plan passed as context. Starts
  // a fresh AbortController so it can run independently of the generation
  // suite (or cancel itself if the student triggers a second inpaint on
  // the same step mid-stream). We DO NOT touch runAbortRef here — that
  // controller belongs to the generation suite. Inpainting lives on its
  // own per-step controller keyed by step id.
  const inpaintingAbortsRef = useRef<Map<string, AbortController>>(new Map())

  const handleStartInpainting = useCallback(
    async (
      stepId: string,
      action: Exclude<InpaintingAction, null>,
    ): Promise<void> => {
      const currentPlan = actionPlanRef.current
      if (!currentPlan) return
      const step = currentPlan.steps.find((s) => s.id === stepId)
      if (!step) return

      // Cancel a prior inpaint on this same step.
      const prior = inpaintingAbortsRef.current.get(stepId)
      if (prior) prior.abort()
      const controller = new AbortController()
      inpaintingAbortsRef.current.set(stepId, controller)
      const { signal } = controller

      // Mark the step as inpainting so the UI shows its transient state.
      startInpainting(stepId, action)

      try {
        const { system, user } = buildInpaintingPrompt({
          plan: currentPlan,
          step,
          action,
          personal: personalRef.current,
          intent: intentRef.current,
        })
        const iterator = streamClaude({
          system,
          messages: [{ role: 'user', content: user }],
          signal,
        })
        let accumulated = ''
        for await (const chunk of iterator) {
          if (signal.aborted) return
          accumulated += chunk
          // For inpainting we overwrite rather than append — hold the
          // accumulated text and commit it on clean finish so the previous
          // body stays visible until the new one is ready. This avoids a
          // flash of empty state during the stream.
        }
        if (signal.aborted) return
        inpaintingComplete(stepId, accumulated)
      } catch (err) {
        if (signal.aborted) return
        console.error(`Inpainting ${action} on ${stepId} failed`, err)
        // Clear the transient inpainting flag so the UI doesn't get stuck.
        inpaintingComplete(stepId, step.body)
      } finally {
        if (inpaintingAbortsRef.current.get(stepId) === controller) {
          inpaintingAbortsRef.current.delete(stepId)
        }
      }
    },
    [inpaintingComplete, startInpainting],
  )

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
  return (
    <>
      <AnimatePresence mode="popLayout">
        {phase === 'discovery' ? (
          <DiscoveryScreen
            key="discovery"
            onSearchCardSubmit={handleGenerate}
          />
        ) : (
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
            setStepPill={setStepPill}
            startInpainting={handleStartInpainting}
            onBuild={handleBuild}
            onBack={reset}
          />
        )}
      </AnimatePresence>
      <Toolbar
        phase={phase}
        intent={intent}
        isGenerating={selectIsGenerating(phase)}
        researchStatus={researchStatus}
        onGenerate={handleGenerate}
        chatMessages={chat.messages}
        isChatOpen={chat.isOpen}
        onOpenChat={openChat}
        onCloseChat={closeChat}
        onChatSend={handleChatSend}
      />
    </>
  )
}
