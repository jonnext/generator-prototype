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
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useState, useTransition } from 'react'
import { ArchitectureDiagram } from '@/components/canvas/ArchitectureDiagram'
import { ContinueStepCTA } from '@/components/canvas/ContinueStepCTA'
import { ProjectHeader } from '@/components/canvas/ProjectHeader'
import { MetadataRow } from '@/components/canvas/MetadataRow'
import { PlaceholderStepRow } from '@/components/canvas/PlaceholderStepRow'
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
  /** DP1.8.A.2 — pill escape hatch. Forwarded to each StepCard / StepPill so
   *  the "Talk it through →" link can hand the decision off to App, which
   *  opens the chat tray with a seeded system message. */
  onAskAboutPill?: (stepId: string, decisionType: string) => void
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

// DP1.8.D.1 — derive the canvas title from the user's prompt directly.
// The prompt is the canonical statement of intent; Phase A's eventual
// `actionPlan.title` is just a paraphrase. Using the prompt and never
// swapping means the Typewriter runs exactly once — no retype when
// actionPlan lands or when Phase D mutates the plan reference.
function deriveTitleFromIntent(intent: string | undefined): string {
  if (!intent) return ''
  const trimmed = intent.trim()
  if (trimmed.length === 0) return ''
  // Strip a trailing period (titles don't take one) and capitalize the
  // first character so prompts like "a Claude app…" read as proper titles.
  const noTrailingDot = trimmed.replace(/\.+$/, '')
  return noTrailingDot.charAt(0).toUpperCase() + noTrailingDot.slice(1)
}

// DP1.7.F — stable no-op fallback for ContinueStepCTA when onTriggerStep
// is unset. Module-level so the CTA's memo stays intact across renders.
const noopTriggerStep = (_stepIndex: number) => {
  void _stepIndex
}

// DP1.8.D.4 — sequenced materializing timeline. Each beat lands after the
// prior animation completes so the canvas reads as "the agent is building
// the outline" rather than "everything appears at once". Per Jon's brief
// (2026-04-27): the architecture diagram should land mathematically after
// step 5 finishes typing, so the buffer time provided by the cascade fills
// the diagram's 20-25s generation window.
//
// Order:  header types  →  metadata fades  →  step rows cascade  →  diagram
//
// HEADER_TITLE_SPEED_MS must match ProjectHeader.tsx:21 — it's the source
// of truth for how long the title typewriter takes per character. If that
// number changes, this one must change too.
const HEADER_TITLE_SPEED_MS = 60
const HEADER_TO_METADATA_BEAT_MS = 350
const METADATA_FADE_DURATION_MS = 350
const METADATA_TO_STEPS_BEAT_MS = 250
const STEP_CASCADE_INTERVAL_MS = 1500
const STEP_ROW_FADE_DURATION_MS = 350

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
  onAskAboutPill,
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

  // Title + description.
  //
  // DP1.8.D.1 — the title is derived from the user's prompt and held stable
  // for the life of the project. Phase A produces its own `actionPlan.title`
  // (a paraphrase) but we ignore it at the header level — using one canonical
  // string means the Typewriter types it exactly once and never re-fires
  // when actionPlan mutates (Phase B Pass 2, Phase D ready, sculpt regens).
  // The description starts empty until Phase A's `actionPlan.description`
  // lands; the empty→real transition is a single first-reveal because
  // text was '' at mount, so index was already 0 — no setIndex(0) reset.
  const title = useMemo(() => deriveTitleFromIntent(intent), [intent])
  const description = actionPlan?.description ?? ''

  const statusLabel = useMemo(() => phaseStatusLabel(phase), [phase])

  // Skeleton step cards during materializing — 5 placeholders reveal in a
  // delayed cascade after header + metadata land (DP1.8.D.4).
  const skeletonStepIds = useMemo(() => ['s1', 's2', 's3', 's4', 's5'], [])

  // DP1.8.D.4 — derived timeline anchors for the "agent building the outline"
  // sequence. Header-first (types from t=0), metadata-second (fades in once
  // title finishes), step-cascade-third (placeholder rows enter one at a
  // time as the agent "drafts" each one). Reduced motion collapses every
  // delay to 0 so the canvas snaps to its final state with no choreography.
  const titleDurationMs = useMemo(
    () => (prefersReducedMotion ? 0 : title.length * HEADER_TITLE_SPEED_MS),
    [title, prefersReducedMotion],
  )
  const metadataStartMs = useMemo(
    () => (prefersReducedMotion ? 0 : titleDurationMs + HEADER_TO_METADATA_BEAT_MS),
    [titleDurationMs, prefersReducedMotion],
  )
  const stepsCascadeStartMs = useMemo(
    () =>
      prefersReducedMotion
        ? 0
        : metadataStartMs + METADATA_FADE_DURATION_MS + METADATA_TO_STEPS_BEAT_MS,
    [metadataStartMs, prefersReducedMotion],
  )

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

  // DP1.8.D.3 — diagram slot gate. The architecture diagram shimmer should
  // only mount AFTER the step heading cascade has finished step N, so the
  // student sees the headings type in cleanly first and THEN the image
  // placeholder appears as its own deliberate beat. Cascade timing:
  //   step heading start = stepIndex * 1500ms
  //   step length        ≈ 25 chars * 18ms ≈ 450ms typing
  //   step N completes   ≈ (N-1) * 1500 + ~600ms after actionPlan lands
  // Reduced motion bypasses the wait — no choreography to honour.
  const [diagramSlotReady, setDiagramSlotReady] = useState(false)
  useEffect(() => {
    if (!actionPlan) {
      setDiagramSlotReady(false)
      return
    }
    if (diagramSlotReady) return
    if (prefersReducedMotion) {
      setDiagramSlotReady(true)
      return
    }
    const stepCount = Math.max(1, actionPlan.steps.length)
    const cascadeMs = (stepCount - 1) * 1500 + 1000
    const timeout = window.setTimeout(() => setDiagramSlotReady(true), cascadeMs)
    return () => window.clearTimeout(timeout)
  }, [actionPlan, diagramSlotReady, prefersReducedMotion])

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
            renders nothing when status is idle/failed (graceful).
            DP1.8.D.3 — gated behind `diagramSlotReady` so the shimmer
            doesn't compete with the heading cascade for attention; the
            slot only mounts once step N's title has finished typing. */}
        {diagramSlotReady ? (
          <ArchitectureDiagram
            status={actionPlan?.diagramStatus}
            diagramUrl={actionPlan?.diagramUrl}
            title={actionPlan?.title ?? title}
            stepHeadings={actionPlan?.steps.map((s) => s.heading) ?? []}
          />
        ) : null}

        {/* MetadataRow — persistent medium-granularity pills.
            DP1.8.D.4 — wrapped in a delayed motion.div so the row fades in
            ONLY after the header title finishes typing. Without this gate
            the row was visible from t=0 alongside a typing header, which
            collided with the "agent building the outline" sequence Jon
            sketched in the timeline brief. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: metadataStartMs / 1000,
            duration: METADATA_FADE_DURATION_MS / 1000,
            ease: 'easeOut',
          }}
        >
          <MetadataRow
            personal={personal}
            origins={personalOrigins}
            onChange={handlePersonalChange}
          />
        </motion.div>

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
                        onAskAboutPill={onAskAboutPill}
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
                // DP1.8.D.2 — typewriter placeholder rows replace the prior
                // pulsing bars. DP1.8.D.4 — each row's outer fade-in AND its
                // inner Typewriter share a single per-row delay
                // (`stepsCascadeStartMs + index * 1500ms`) so the row visually
                // appears AS the agent starts drafting it, not before.
                //
                // Keys are prefixed `placeholder-${id}` (vs the real step's
                // `id` which is just `s1`-`s5`) so React fully unmounts the
                // delayed-fade placeholder wrappers when actionPlan lands and
                // the ternary branch flips to real StepCards. Without this,
                // a real StepCard could mount inside a placeholder wrapper
                // that was still waiting on its delayed fade-in and stay
                // invisible.
                const rowDelaySec =
                  (stepsCascadeStartMs + index * STEP_CASCADE_INTERVAL_MS) / 1000
                return (
                  <motion.div
                    key={`placeholder-${id}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: rowDelaySec,
                      duration: STEP_ROW_FADE_DURATION_MS / 1000,
                      ease: 'easeOut',
                    }}
                  >
                    <PlaceholderStepRow
                      stepIndex={index}
                      cascadeStartMs={stepsCascadeStartMs}
                    />
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
