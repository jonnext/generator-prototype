// CanvasScreen — the continuous canvas that spans four phases:
//   1. materializing  (600ms staggered reveal of header + metadata + skeletons)
//   2. sculpting      (step cards visible, pills interactive, no bodies yet)
//   3. generating     (streaming step bodies in, chat tray docked)
//   4. complete       (everything rendered, refine-or-continue affordances)
//
// Critical invariant: ONE component mounts for the life of the canvas visit.
// Phases modulate what the canvas SHOWS, never whether it exists. That keeps
// scroll position, input focus, expanded-step state, and chat tray state
// preserved across phase changes without a full unmount/remount cycle.
//
// Shared-element transitions handled by Motion layoutIds:
//   - chatInput: Discovery SearchInput -> docked chat button (I7 will wire full tray)
//   - projectHeader: cross-phase continuity within the canvas
//
// Per the plan's 600ms Koch cap, the materializing stagger is:
//   - header: immediate (delay 50ms from staggerParent)
//   - metadata row: +60ms
//   - skeleton step cards: +60ms per card (5 cards -> 300ms total)
//   Total = ~310ms, well under the 600ms cap.
//
// I6 replaces the skeleton step cards with real StepCard components.
// I7 replaces the docked chat button with the full ChatTray.

import { motion } from 'motion/react'
import { memo, useCallback, useLayoutEffect, useMemo, useTransition } from 'react'
import { ProjectHeader } from '@/components/canvas/ProjectHeader'
import { MetadataRow } from '@/components/canvas/MetadataRow'
import { StepCard } from '@/components/canvas/StepCard'
import {
  staggerParentVariants,
  stepCardVariants,
} from '@/motion/choreography'
import { sharedElement } from '@/motion/springs'
import { rationales } from '@/lib/copy'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import type {
  ActionPlan,
  InpaintingAction,
  PersonalPillOrigins,
  PersonalPills,
  Phase,
} from '@/lib/state'

// ----------------------------------------------------------------------------
// Props — state is lifted to App.tsx (one useShapingEngine instance) and
// passed down. This keeps the slice split honest: App owns the store, and
// components like CanvasScreen receive only the slices they need. Per-slice
// memoization (React.memo on children) limits re-render scope the same way
// subscribing to separate hooks would.
// ----------------------------------------------------------------------------

export interface CanvasScreenProps {
  intent: string
  phase: Phase
  personal: PersonalPills
  personalOrigins: PersonalPillOrigins
  actionPlan: ActionPlan | null
  expandedStepId: string | null
  setPhase: (next: Phase) => void
  setPersonalPill: <K extends keyof PersonalPills>(
    key: K,
    value: PersonalPills[K],
  ) => void
  expandStep: (stepId: string | null) => void
  setStepPill: (
    stepId: string,
    decisionType: string,
    selected: string,
    aiPicked: boolean,
  ) => void
  startInpainting: (
    stepId: string,
    action: Exclude<InpaintingAction, null>,
  ) => void
  /** Fires when the student taps the Build button in ProjectHeader. */
  onBuild: () => void
  onBack: () => void
}

// ----------------------------------------------------------------------------
// Phase-aware badge copy (kicker above the project title)
// ----------------------------------------------------------------------------

function phaseBadge(phase: Phase): string {
  switch (phase) {
    case 'materializing':
      return 'Sketching your project…'
    case 'sculpting':
      return 'Shape it before we build'
    case 'build':
      return 'Locking it in…'
    case 'generating':
      return 'Writing the steps'
    case 'complete':
      return 'Ready to build'
    default:
      return 'Project'
  }
}

// ----------------------------------------------------------------------------
// CanvasScreen
// ----------------------------------------------------------------------------

function CanvasScreenImpl({
  intent,
  phase,
  personal,
  personalOrigins,
  actionPlan,
  expandedStepId,
  setPhase,
  setPersonalPill,
  expandStep,
  setStepPill,
  startInpainting,
  onBuild,
  onBack,
}: CanvasScreenProps) {
  // Phase transitions are non-urgent: wrap in startTransition so input
  // events stay responsive during heavy reflow.
  const [, startPhaseTransition] = useTransition()

  // Thread 1 scroll fix — when the Canvas enters the `materializing` phase
  // after Discovery, the sibling AnimatePresence (popLayout) in App.tsx still
  // has Discovery occupying viewport height during the shared-element morph,
  // so the newly mounted Canvas content lands below the fold. Jump to top
  // BEFORE paint so the stagger sequence reveals in place.
  //
  // Keyed on `phase` only. Fires on the first render with `materializing` and
  // any re-entry; does not fire while the canvas stays in sculpting/generating.
  // `behavior: 'instant'` in both branches — prefers-reduced-motion is honoured
  // by skipping `smooth`, which is already the API contract here.
  const prefersReducedMotion = usePrefersReducedMotion()
  useLayoutEffect(() => {
    if (phase !== 'materializing') return
    if (typeof window === 'undefined') return
    // Instant scroll-to-top — no smooth behavior, so reduced-motion users and
    // regular users get the same jank-free snap. The variable is read so the
    // linter + future maintainers see the dependency is intentional.
    void prefersReducedMotion
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [phase, prefersReducedMotion])

  const handlePhaseAdvance = useCallback(
    (next: Phase) => {
      startPhaseTransition(() => setPhase(next))
    },
    [setPhase],
  )

  // MetadataRow only needs a single setter — stabilize via useCallback so
  // the memoized row doesn't re-render when other slices tick.
  const handlePersonalChange = useCallback(
    <K extends keyof PersonalPills>(key: K, value: PersonalPills[K]) => {
      setPersonalPill(key, value)
    },
    [setPersonalPill],
  )

  // Title + description are derived during render (no useState, no useEffect
  // storing copies). Source of truth is actionPlan when it exists, otherwise
  // the intent string that triggered materialization.
  const title = actionPlan?.title ?? intent ?? 'Untitled project'
  const description =
    actionPlan?.description ??
    "Shaping an outline now. You will be able to swap steps, choose tools, and regenerate anything before we build it."

  const badge = useMemo(() => phaseBadge(phase), [phase])

  // Skeleton step cards during materializing — 5 placeholders reveal with
  // 60ms stagger for the Koch orchestrated feel before the real plan lands.
  const skeletonStepIds = useMemo(() => ['s1', 's2', 's3', 's4', 's5'], [])

  // ---- StepCard handlers ---------------------------------------------------
  // Each handler is a thin wrapper over the engine setters so CanvasScreen
  // can add cross-slice coordination if needed later. Today they just
  // forward. Stabilized via useCallback so the memoized StepCard children
  // don't re-render unless their own step changes.

  const handleExpandStep = useCallback(
    (stepId: string) => expandStep(stepId),
    [expandStep],
  )
  // Collapse ignores the stepId — there's only ever one expanded step at a
  // time in the engine, so closing it is "set expanded to null" regardless
  // of which card asked. The StepCard callback signature still passes the
  // id for symmetry with onExpand, but we drop it via the widened type.
  const handleCollapseStep = useCallback(
    () => expandStep(null),
    [expandStep],
  )
  const handlePickPill = useCallback(
    (stepId: string, decisionType: string, selected: string) => {
      setStepPill(stepId, decisionType, selected, false)
    },
    [setStepPill],
  )
  // Randomize resolves to the "AI picked" option name from copy rationales.
  // The name of that option is the string students see on the chip.
  const handleRandomizePill = useCallback(
    (stepId: string, decisionType: string) => {
      // Late import avoidance: we pull from the same copy module already
      // imported by StepPill / ResearchCard. Local require style keeps the
      // canvas screen lean — import is static, look up is inline.
      const picked = pickRandomizeDefault(decisionType)
      setStepPill(stepId, decisionType, picked, true)
    },
    [setStepPill],
  )
  const handleStartInpainting = useCallback(
    (stepId: string, action: Exclude<InpaintingAction, null>) => {
      startInpainting(stepId, action)
    },
    [startInpainting],
  )

  return (
    <main className="relative min-h-dvh w-full bg-paper text-leather">
      <motion.div
        layout
        transition={sharedElement}
        className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col gap-6 px-4 pt-10 pb-40 md:pt-16"
      >
        {/* Top bar — Back link and optional phase advance (dev affordance) */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="font-body text-xs uppercase tracking-[0.12em] text-brand-400 hover:text-leather"
          >
            ← Discovery
          </button>
          {phase === 'materializing' ? (
            <button
              type="button"
              onClick={() => handlePhaseAdvance('sculpting')}
              className="font-heading rounded-xl border border-brand-100 bg-warm-white px-3 py-1.5 text-xs text-leather"
            >
              Skip reveal
            </button>
          ) : null}
        </div>

        {/* ProjectHeader — shared element across phases via layoutId */}
        <ProjectHeader
          badge={badge}
          title={title}
          description={description}
          phase={phase}
          onBuild={onBuild}
        />

        {/* MetadataRow — persistent medium-granularity pills */}
        <MetadataRow
          personal={personal}
          origins={personalOrigins}
          onChange={handlePersonalChange}
        />

        {/* Steps region — skeleton in materializing, real plan in I6+ */}
        <motion.section
          variants={staggerParentVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-3"
          aria-label="Project steps"
        >
          {actionPlan
            ? actionPlan.steps.map((step) => (
                <motion.div key={step.id} variants={stepCardVariants}>
                  <StepCard
                    step={step}
                    // During build/generating/complete phases, ALL step cards
                    // auto-expand so streaming body content is visible across
                    // all 5 steps at once. During sculpting (before Build) the
                    // original single-expand behavior still applies so the
                    // student can focus on one step's pills at a time.
                    isExpanded={
                      phase === 'build' ||
                      phase === 'generating' ||
                      phase === 'complete' ||
                      expandedStepId === step.id
                    }
                    onExpand={handleExpandStep}
                    onCollapse={handleCollapseStep}
                    onPickPill={handlePickPill}
                    onRandomizePill={handleRandomizePill}
                    onStartInpainting={handleStartInpainting}
                  />
                </motion.div>
              ))
            : skeletonStepIds.map((id, index) => {
                // Each placeholder shows its step number + a pulsing loader
                // bar so the student can feel the 5-step shape of the project
                // before Claude's skeleton call lands. Matches the J3-0 Paper
                // frame "Round 5 - ideal flow" post-generate target.
                const stepNumber = (index + 1).toString().padStart(2, '0')
                return (
                  <motion.div
                    key={id}
                    variants={stepCardVariants}
                    className="flex w-full items-center gap-4 rounded-2xl border border-brand-50 bg-warm-white px-4 py-5 shadow-[var(--shadow-card)]"
                    aria-hidden
                  >
                    <span className="font-body text-xs text-brand-400">
                      {stepNumber}
                    </span>
                    <div className="h-2.5 flex-1 rounded-full bg-brand-50/70 animate-pulse" />
                  </motion.div>
                )
              })}
        </motion.section>
      </motion.div>
      {/* ChatTray is mounted at App root (not here) so it survives phase
          transitions without unmounting and its layoutId-anchored position
          stays stable for the Discovery → Canvas shared-element morph. */}
    </main>
  )
}

export const CanvasScreen = memo(CanvasScreenImpl)

// ----------------------------------------------------------------------------
// Randomize helper — resolves "I don't know, you tell me" to a concrete
// option name using the rationale copy. Falls back to the decisionType
// string itself if no rationale is authored, so the state stays valid.
// ----------------------------------------------------------------------------

function pickRandomizeDefault(decisionType: string): string {
  const rationale = rationales[decisionType]
  return rationale?.picked ?? decisionType
}
