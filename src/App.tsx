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
import { useCallback, useRef } from 'react'
import { DiscoveryScreen } from '@/screens/DiscoveryScreen'
import { CanvasScreen } from '@/screens/CanvasScreen'
import { ChatTray } from '@/components/ChatTray'
import { useShapingEngine, selectIsGenerating } from '@/hooks/useShapingEngine'
import { callClaude, streamClaude } from '@/lib/claude'
import {
  buildActionPlanPrompt,
  parseActionPlanSkeleton,
  type ActionPlanSkeleton,
} from '@/lib/actionPlan'
import {
  buildStepBodyPrompt,
  buildInpaintingPrompt,
} from '@/lib/inpainting'
import type { SeedProject } from '@/lib/seedProjects'
import type {
  ActionPlan,
  ChatMessage,
  InpaintingAction,
  PersonalPills,
  Step,
  StepPillRow,
} from '@/lib/state'

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
// App
// ----------------------------------------------------------------------------

export function App() {
  const engine = useShapingEngine()
  const {
    phase,
    intent,
    personal,
    actionPlan,
    expandedStepId,
    chat,
    setPhase,
    setPersonalPill,
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

  // --------------------------------------------------------------------------
  // Parallel Claude driver — shared by handleGenerate and chat re-runs.
  // --------------------------------------------------------------------------
  //
  // Given the current intent + personal + (optional) chat context, this:
  //   1. Calls Claude for the Action Plan skeleton (non-streaming).
  //   2. Seeds the reducer with the skeleton so all 5 step cards render.
  //   3. Fires Promise.all of N step body streams in parallel.
  //   4. Each stream appends chunks to its own step as they arrive, so the
  //      UI shows progressive text without waiting for other steps.
  //   5. On the final step completing, phase advances to 'complete'.
  //
  // Aborted runs are detected via signal.aborted and exit silently (the
  // handler that called abort owns the next-run scheduling).

  const runGeneration = useCallback(
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

      // ---- Step 1: Action Plan skeleton (non-streaming, full object) -------
      let skeleton: ActionPlanSkeleton
      try {
        const { system, user } = buildActionPlanPrompt({
          intent: nextIntent,
          personal: personalRef.current,
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
        // Leave the canvas in materializing state so the skeleton cards
        // stay visible rather than wiping back to discovery. A future
        // error-surface iteration can promote this to a toast.
        return
      }

      const plan = skeletonToActionPlan(skeleton)
      setActionPlan(plan)
      setPhase('sculpting')

      // ---- Step 2: parallel step body streams -----------------------------
      //
      // async-parallel: fire all N streams with Promise.all instead of
      // awaiting each in sequence. Each stream:
      //   - Builds its prompt from the shared plan + its own step.
      //   - Reads chunks via streamClaude's async generator.
      //   - Writes chunks into the reducer as they arrive.
      //   - Marks the step complete on clean end.
      //
      // We flip to 'generating' immediately before awaiting so the chat
      // tray pulse engages while all 5 streams are racing.
      setPhase('generating')

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
      setPhase('complete')
      runAbortRef.current = null
    },
    [
      appendStepBodyChunk,
      setActionPlan,
      setPhase,
      stepBodyComplete,
    ],
  )

  // --------------------------------------------------------------------------
  // Public handlers wired to the screens
  // --------------------------------------------------------------------------

  const handleGenerate = useCallback(
    (value: string) => {
      // startMaterializing seeds intent + clears prior plan synchronously
      // so the canvas reveal animation can kick in before Claude responds.
      startMaterializing(value)
      void runGeneration(value, [])
    },
    [runGeneration, startMaterializing],
  )

  const handlePickCommunity = useCallback(
    (project: SeedProject) => {
      // Community tiles seed the intent from the tile's title. Future work
      // can prefill pill decisions from the tile's metadata.
      startMaterializing(project.title)
      void runGeneration(project.title, [])
    },
    [runGeneration, startMaterializing],
  )

  // Chat send — honours the plan's interruptibility rule. The tray NEVER
  // gates input on a generating flag. When the student sends while a
  // stream is in flight we:
  //   1. Abort the current run (runGeneration does this on its next call).
  //   2. Append the user's message to the chat transcript.
  //   3. Re-run generation with the updated chat transcript as context.
  const handleChatSend = useCallback(
    (text: string, isInterrupt: boolean) => {
      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: text,
      }
      addChatMessage(userMessage)

      // Build the message list we want to forward to Claude. Read the
      // current chat messages from the ref-mirrored store by deriving from
      // the engine's chat.messages snapshot at call time — we rely on the
      // addChatMessage above to have updated the reducer by the time
      // runGeneration reads it. Since addChatMessage dispatches synchronously
      // the new message is in chat.messages before the next microtask, but
      // to be safe we append it manually to the forwarded list.
      const forwarded = [...chat.messages, userMessage]

      // Only re-run generation if we already have an intent (the student is
      // on the canvas, not the discovery screen). If intent is empty we
      // still just append the message and let the next Generate fire the
      // real call.
      if (intentRef.current.length > 0) {
        void runGeneration(intentRef.current, forwarded)
      } else if (isInterrupt) {
        // Nothing to abort — interrupt is a no-op off-canvas.
        runAbortRef.current?.abort()
        runAbortRef.current = null
      }
    },
    [addChatMessage, chat.messages, runGeneration],
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
  // coexist briefly so the SearchInput layoutId can interpolate into the
  // ChatTray layoutId.
  //
  // ChatTray is mounted OUTSIDE the AnimatePresence block so it survives
  // every phase transition. That preserves its draft text, scroll position,
  // and — critically for I8 — the Claude stream AbortController ref. The
  // tray fades out via its isVisible prop during the discovery phase while
  // staying mounted, so its layoutId-anchored wrapper is always available
  // as a target for the SearchInput -> ChatTray shared-element morph.
  return (
    <>
      <AnimatePresence mode="popLayout">
        {phase === 'discovery' ? (
          <DiscoveryScreen
            key="discovery"
            onGenerate={handleGenerate}
            onPickCommunity={handlePickCommunity}
          />
        ) : (
          <CanvasScreen
            key="canvas"
            intent={intent}
            phase={phase}
            personal={personal}
            actionPlan={actionPlan}
            expandedStepId={expandedStepId}
            setPhase={setPhase}
            setPersonalPill={setPersonalPill}
            expandStep={expandStep}
            setStepPill={setStepPill}
            startInpainting={handleStartInpainting}
            onBack={reset}
          />
        )}
      </AnimatePresence>
      <ChatTray
        messages={chat.messages}
        isOpen={chat.isOpen}
        isGenerating={selectIsGenerating(phase)}
        isVisible={phase !== 'discovery'}
        onOpen={openChat}
        onClose={closeChat}
        onSend={handleChatSend}
      />
    </>
  )
}
