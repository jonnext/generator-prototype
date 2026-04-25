// CanvasScreen — the continuous canvas that spans the post-discovery phases:
//   1. materializing  (~600ms staggered reveal of header + metadata + skeletons)
//   2. learning       (step cards visible, pills interactive, append/remove later)
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
import { Fragment, memo, useCallback, useLayoutEffect, useMemo, useTransition } from 'react'
import { ArchitectureDiagram } from '@/components/canvas/ArchitectureDiagram'
import { ContinueStepCTA } from '@/components/canvas/ContinueStepCTA'
import { ProjectHeader } from '@/components/canvas/ProjectHeader'
import { MetadataRow } from '@/components/canvas/MetadataRow'
import { ResearchPulse } from '@/components/canvas/ResearchPulse'
import { StepCard } from '@/components/canvas/StepCard'
import {
  staggerParentVariants,
  stepCardVariants,
} from '@/motion/choreography'
import { sharedElement } from '@/motion/springs'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { selectBranchCandidatesByStep } from '@/hooks/useShapingEngine'
import type {
  ActionPlan,
  PersonalPillOrigins,
  PersonalPills,
  Phase,
  ResearchFinding,
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
  /**
   * DP1.5.I — the App-owned handlers that flip the pill AND fire Phase R
   * research + block regen. CanvasScreen forwards them verbatim to StepCard.
   * Previously CanvasScreen wrapped the raw setStepPill to add the aiPicked
   * flag; that's now centralized in App so research can re-fire on toggle.
   */
  onPickPill: (stepId: string, decisionType: string, selected: string) => void
  onRandomizePill: (stepId: string, decisionType: string) => void
  onBack: () => void
  /** REFINE STEP → chip click — enters Highway for the given step. */
  onRefineStep: (stepId: string) => void
  /** Remove a step from the plan. */
  onRemoveStep: (stepId: string) => void
  /** Add a new step at the end of the plan. */
  onAddStep: () => void
  /** Whether an add-step call is in flight. */
  isAddingStep?: boolean
  /** DP1.5.H — research orchestrator has in-flight calls. Shown as a
   *  "Researching…" pulse in the top bar while findings stream in. */
  isResearching?: boolean
  /** DP1.5.J — research store findings dictionary (keyed by id). Used to
   *  derive per-step branch candidates. Passing the full dictionary and
   *  filtering here (memoized per-step) keeps StepCards memo-stable when
   *  findings unrelated to a given step land. */
  findings?: Record<string, ResearchFinding>
  onBranchApply?: (finding: ResearchFinding, stepId: string) => void
  onBranchDismiss?: (findingId: string) => void
  /** DP1.7.G — alt trigger entry point. Forwarded to each StepCard so the
   *  pending-state "Generate this step" link calls App's handleTriggerNextStep
   *  with the target stepIndex. DP1.7.F's Continue CTA will share the same
   *  callback, keeping both surfaces in sync. */
  onTriggerStep?: (stepIndex: number) => void
}

// ----------------------------------------------------------------------------
// Phase-aware badge copy (kicker above the project title)
// ----------------------------------------------------------------------------

// Copy shown inside the SketchStatusPill (dark pill top-left). Matches 294-0
// "● SKETCHING YOUR PROJECT" during sculpting. Kept terse because the pill is
// small; the rich phase narrative lives in the dock copy below.
function phaseStatusLabel(phase: Phase): string {
  switch (phase) {
    case 'materializing':
      return 'Sketching your project'
    case 'learning':
      return 'Sketching your project'
    default:
      return 'Project'
  }
}

// DP1.5.J — stable empty array reference so StepCards that have no branch
// candidates keep their memoized props. Creating [] inline on each render
// would churn their memo regardless of whether anything actually changed.
const EMPTY_FINDINGS: ResearchFinding[] = []

// DP1.7.F — stable no-op fallback for ContinueStepCTA when onTriggerStep
// is unset. Module-level so the CTA's memo stays intact across renders.
const noopTriggerStep = (_stepIndex: number) => {
  void _stepIndex
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
  onPickPill,
  onRandomizePill,
  onBack,
  onRefineStep,
  onRemoveStep,
  onAddStep,
  isAddingStep = false,
  isResearching = false,
  findings,
  onBranchApply,
  onBranchDismiss,
  onTriggerStep,
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

  const statusLabel = useMemo(() => phaseStatusLabel(phase), [phase])

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
  // DP1.5.I — pick + randomize handlers are now App-owned (they need to
  // both flip the pill AND fire Phase R research). CanvasScreen just
  // forwards the incoming props to StepCard.

  // DP1.5.J — per-step branch candidates derived from the findings store.
  // Memoized so StepCards only see a new array when *their* step's
  // candidate set changes, not on every finding landing. Uses the empty-
  // object fallback when findings is undefined so the hook deps array is
  // always a stable reference.
  const branchCandidatesByStep = useMemo(() => {
    const empty: Record<string, ResearchFinding[]> = {}
    if (!actionPlan || !findings) return empty
    for (const step of actionPlan.steps) {
      empty[step.id] = selectBranchCandidatesByStep(findings, step.id)
    }
    return empty
  }, [actionPlan, findings])

  return (
    <main className="relative min-h-dvh w-full bg-paper text-leather">
      <motion.div
        layout
        transition={sharedElement}
        className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col gap-6 px-4 pt-10 pb-40 md:pt-16"
      >
        {/* Top bar — Back link on the left; ResearchPulse + Skip reveal
            on the right. The pulse is agent-as-teammate per the Strategic
            Framing section of the plan — "Researching…" copy, not a
            spinner. Persists across materializing → learning so students
            see the research agent keep working even after the skeleton
            lands. */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="font-body text-xs uppercase tracking-[0.12em] text-brand-400 hover:text-leather"
          >
            ← Discovery
          </button>
          <div className="flex items-center gap-2">
            <ResearchPulse active={isResearching} />
            {phase === 'materializing' ? (
              <button
                type="button"
                onClick={() => handlePhaseAdvance('learning')}
                className="font-heading rounded-xl border border-brand-100 bg-warm-white px-3 py-1.5 text-xs text-leather"
              >
                Skip reveal
              </button>
            ) : null}
          </div>
        </div>

        {/* ProjectHeader — shared element across phases via layoutId */}
        <ProjectHeader
          statusLabel={statusLabel}
          title={title}
          description={description}
          phase={phase}
        />

        {/* DP1.6 — Phase D architecture diagram. Renders shimmer while
            Gemini Pro draws (~20-25s), crossfades to image when ready,
            renders nothing when status is idle/failed (graceful). */}
        <ArchitectureDiagram
          status={actionPlan?.diagramStatus}
          diagramUrl={actionPlan?.diagramUrl}
          title={actionPlan?.title ?? title}
          stepHeadings={actionPlan?.steps.map((s) => s.heading) ?? []}
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
            ? actionPlan.steps.map((step, index) => {
                // DP1.7.F — between-steps Continue CTA. Visible only when this
                // step is 'ready' AND the next step is 'pending'. Hides the
                // moment the CTA is tapped (next step flips to 'generating')
                // and re-emerges once that step reaches 'ready' if step+2 is
                // still pending. Sculpt-refresh path keeps status 'ready' so
                // the CTA stays put across regen — no extra plumbing needed.
                const nextStep = actionPlan.steps[index + 1]
                const showContinueCTA =
                  step.generationStatus === 'ready' &&
                  nextStep !== undefined &&
                  nextStep.generationStatus === 'pending'
                return (
                  <Fragment key={step.id}>
                    <motion.div variants={stepCardVariants}>
                      <StepCard
                        step={step}
                        stepIndex={index}
                        pillDefinitions={actionPlan.pillDefinitions}
                        isExpanded={expandedStepId === step.id}
                        onExpand={handleExpandStep}
                        onCollapse={handleCollapseStep}
                        onPickPill={onPickPill}
                        onRandomizePill={onRandomizePill}
                        onRefineStep={onRefineStep}
                        onRemoveStep={onRemoveStep}
                        branchCandidates={branchCandidatesByStep[step.id] ?? EMPTY_FINDINGS}
                        onBranchApply={onBranchApply}
                        onBranchDismiss={onBranchDismiss}
                        headingStartDelay={prefersReducedMotion ? 0 : index * 1500}
                        onTriggerStep={onTriggerStep}
                      />
                    </motion.div>
                    {showContinueCTA && nextStep ? (
                      <ContinueStepCTA
                        nextStepIndex={index + 1}
                        nextStepHeading={nextStep.heading}
                        onTrigger={onTriggerStep ?? noopTriggerStep}
                      />
                    ) : null}
                  </Fragment>
                )
              })
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
          {actionPlan && phase === 'learning' ? (
            <button
              type="button"
              onClick={onAddStep}
              disabled={isAddingStep}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-100 px-4 py-4 font-body text-sm text-brand-400 hover:border-brand-200 hover:text-leather transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {isAddingStep ? 'Adding step…' : '+ Add step'}
            </button>
          ) : null}
        </motion.section>
      </motion.div>
      {/* ChatTray is mounted at App root (not here) so it survives phase
          transitions without unmounting and its layoutId-anchored position
          stays stable for the Discovery → Canvas shared-element morph. */}
    </main>
  )
}

export const CanvasScreen = memo(CanvasScreenImpl)
