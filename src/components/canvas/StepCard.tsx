// StepCard — one row of the project plan.
//
// Collapsed state: heading + Refine Step chip on hover.
// Expanded state: full-width StepPill rows (one per decision) + ResearchCards.
//
// DP1 collapsed the build/generating phases — there are no streamed step
// bodies anymore. Pill shaping is the only expanded affordance until DP3
// reintroduces validation blocks for living documentation.

import { motion, AnimatePresence } from 'motion/react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import type { PillDefinition, ResearchFinding, Step } from '@/lib/state'
import { StepPill } from './StepPill'
import { ResearchCard } from './ResearchCard'
import { BranchChip } from './BranchChip'
import { BlockList } from '@/components/blocks/BlockList'
import { BlockShimmer } from '@/components/blocks/BlockShimmer'
import { Typewriter } from '@/components/Typewriter'
import { focusMorph, stepExpand } from '@/motion/springs'
import { stepExpandVariants } from '@/motion/choreography'
import { layoutIds } from '@/motion/transitions'

export interface StepCardProps {
  step: Step
  /** 0-based position in the step array. Renders as "01", "02", etc. */
  stepIndex: number
  /**
   * Plan-level pill definitions, keyed by decisionType. Carries the Claude-
   * generated question + options + rationale for each decision this step
   * references. Replaces the previous hardcoded lookup into copy.ts.
   */
  pillDefinitions: Record<string, PillDefinition>
  /** Whether the card is in the expanded state (body + pills visible). */
  isExpanded: boolean
  onExpand: (stepId: string) => void
  onCollapse: (stepId: string) => void
  /** Fine-granularity pill setter, forwarded from useStepChoices. */
  onPickPill: (stepId: string, decisionType: string, selected: string) => void
  /** Randomize delegate — resolves the "I don't know" choice to the AI pick. */
  onRandomizePill: (stepId: string, decisionType: string) => void
  /** REFINE STEP → chip handler — wired to enterFocus(stepId) in Chunk B. */
  onRefineStep?: (stepId: string) => void
  /** Remove this step from the plan. */
  onRemoveStep?: (stepId: string) => void
  /** DP1.5.J — research findings flagged as branch candidates for THIS
   *  step (already filtered to not-yet-surfaced via
   *  selectBranchCandidatesByStep). Rendered as BranchChips at the top
   *  of the card. Parent passes a stable empty array when none. */
  branchCandidates?: ResearchFinding[]
  onBranchApply?: (finding: ResearchFinding, stepId: string) => void
  onBranchDismiss?: (findingId: string) => void
  /** DP1.7.C — cascade-staggered typewriter delay for the step heading.
   *  CanvasScreen computes this as `stepIndex * 1500` (or 0 under reduced
   *  motion). Defaults to 0 so a standalone-mounted StepCard still types
   *  immediately. */
  headingStartDelay?: number
  /** DP1.7.G — alt trigger entry point. When the step is 'pending', the
   *  heading row renders a "Generate this step" link that calls this with
   *  the step's index. Wires up to App's handleTriggerNextStep, the same
   *  callback DP1.7.F's Continue CTA will fire. */
  onTriggerStep?: (stepIndex: number) => void
  /** DP1.8.A.2 — pill escape hatch. Forwarded to each StepPill row so the
   *  "Talk it through →" link can hand the decision off to App, which opens
   *  the chat tray with a seeded system message. Optional: when undefined,
   *  StepPill suppresses the link. */
  onAskAboutPill?: (stepId: string, decisionType: string) => void
  /**
   * C-1 Plan-Then-Build (Pattern B) — render mode.
   *
   *  - 'full'    (default) — existing behaviour. Branch chips, body blocks,
   *                          pill rows, refine/remove affordances all gated
   *                          on the usual flags.
   *  - 'compact'           — heading-only treatment used while phase ===
   *                          'planning'. Body blocks, pill chips, branch
   *                          chips, refine/remove buttons, and the alt
   *                          "Generate this step" link are all suppressed
   *                          so the student reads a clean outline. The
   *                          heading typewriter still fires (with the
   *                          cascade-staggered delay) so the planning view
   *                          feels alive rather than pre-rendered.
   *
   * Intentionally a render-time toggle — the StepCard does NOT unmount when
   * mode flips, so its layoutId-anchored heading can morph in place when
   * the canvas commits into the learning phase.
   */
  mode?: 'compact' | 'full'
}

function StepCardImpl({
  step,
  stepIndex,
  pillDefinitions,
  isExpanded,
  onExpand,
  onCollapse,
  onPickPill,
  onRandomizePill,
  onRefineStep,
  onRemoveStep,
  branchCandidates,
  onBranchApply,
  onBranchDismiss,
  headingStartDelay = 0,
  onTriggerStep,
  onAskAboutPill,
  mode = 'full',
}: StepCardProps) {
  const isCompact = mode === 'compact'
  // Local "reopen the pill row" state — tracks which decisionType's chip
  // the student has tapped to edit again. Null = no chip is open.
  const [reopenedDecision, setReopenedDecision] = useState<string | null>(null)

  const handleCardToggle = useCallback(() => {
    if (isExpanded) {
      onCollapse(step.id)
    } else {
      onExpand(step.id)
    }
  }, [isExpanded, onCollapse, onExpand, step.id])

  const handlePick = useCallback(
    (decisionType: string, selected: string) => {
      setReopenedDecision(null)
      onPickPill(step.id, decisionType, selected)
    },
    [onPickPill, step.id],
  )

  const handleRandomize = useCallback(
    (decisionType: string) => {
      setReopenedDecision(null)
      onRandomizePill(step.id, decisionType)
    },
    [onRandomizePill, step.id],
  )

  const handleReopen = useCallback((decisionType: string) => {
    setReopenedDecision(decisionType)
  }, [])

  // DP1.8.A.2 — bind the step id once so StepPill stays decoupled from
  // step identity. StepPill carries decisionType in its row, the step id
  // is contributed by the card.
  const handleAskAboutPill = useCallback(
    (decisionType: string) => {
      onAskAboutPill?.(step.id, decisionType)
    },
    [onAskAboutPill, step.id],
  )

  // Chunk B wires this to enterFocus(stepId) via CanvasScreen's prop drill.
  // Falls back to a console log in case the prop isn't passed (e.g. a test
  // harness mounts StepCard standalone).
  const handleRefineStep = useCallback(() => {
    if (onRefineStep) {
      onRefineStep(step.id)
    } else {
      console.log('[refine stub]', step.id, step.heading)
    }
  }, [onRefineStep, step.id, step.heading])

  const handleRemoveStep = useCallback(() => {
    onRemoveStep?.(step.id)
  }, [onRemoveStep, step.id])

  // DP1.7.G — alt trigger entry point. The pending-state link calls this;
  // the CTA path (DP1.7.F) will share the same callback so both surfaces
  // invoke the same App-level handleTriggerNextStep.
  const handleTriggerStep = useCallback(() => {
    onTriggerStep?.(stepIndex)
  }, [onTriggerStep, stepIndex])

  const isPending = step.generationStatus === 'pending'

  // DP1.8.D.3 — track when the first-reveal block cascade has finished so
  // the StepCard chrome can drop its border while content is mid-typewriter.
  // Flips once via BlockList's onAllBlocksComplete; never re-arms on sculpt
  // refresh because that path uses the static crossfade, not the cascade.
  const [cascadeComplete, setCascadeComplete] = useState(false)
  useEffect(() => {
    // If the step transitions BACK to a non-ready status (rare — sculpt that
    // re-fires generation), reset so the next first-reveal can drop the
    // border again. 'ready' steps that already completed stay completed.
    if (step.generationStatus !== 'ready') {
      setCascadeComplete(false)
    }
  }, [step.generationStatus])
  const handleAllBlocksComplete = useCallback(() => {
    setCascadeComplete(true)
  }, [])
  const hasBlocks = step.blocks !== undefined && step.blocks.length > 0
  const isCascadeTyping =
    step.generationStatus === 'ready' && hasBlocks && !cascadeComplete

  // Derive pill option lists during render from the plan's pillDefinitions.
  // RP1: each definition carries its own options[] (strings), so the option
  // id === label. Memoize keyed by this step's pills so a chat tray pulse
  // doesn't re-walk the map.
  const pillOptionsByDecision = useMemo(() => {
    const map: Record<string, { id: string; label: string }[]> = {}
    for (const pill of step.pills) {
      const definition = pillDefinitions[pill.decisionType]
      map[pill.decisionType] = definition
        ? definition.options.map((name) => ({ id: name, label: name }))
        : []
    }
    return map
  }, [step.pills, pillDefinitions])

  // Chrome shape changes on collapse/expand.
  //
  // Collapsed (294-0 direction): bare editorial row with a thin border and a
  // subtle hover wash. No shadow, no warm-white fill at rest. Decisions move
  // out of this surface — refinement happens by drilling into Highway
  // (Chunk B wires the chip; for Chunk A it's a stub).
  //
  // Expanded: retains today's card chrome because the legacy inline pill
  // experience still lives here until Chunk B + D retire it.
  //
  // C-1 compact: same chrome as collapsed editorial row but without hover
  // affordances — the planning view is read-only outline, not interactive,
  // so we drop the bg/border hover wash to signal "not clickable yet". The
  // cursor stays default via pointer-events-none on the heading button below.
  const chromeClass = isCompact
    ? 'rounded-xl border border-brand-50 px-4 py-4 transition-colors'
    : isExpanded
      ? 'rounded-2xl border border-brand-50 bg-warm-white p-4 shadow-[var(--shadow-card)]'
      : isCascadeTyping
        ? 'rounded-xl px-4 py-4 transition-colors'
        : 'rounded-xl border border-brand-50 px-4 py-4 hover:bg-warm-white/70 hover:border-brand-100 transition-colors'

  return (
    <motion.article
      layout
      transition={stepExpand}
      className={`group relative flex w-full flex-col gap-3 ${chromeClass}`}
      aria-expanded={isExpanded}
    >
      {/* DP1.5.J — branch chips at the top of the card. Rendered only when
          research has surfaced a candidate that contradicts the current
          pathway (e.g. "most tutorials in 2026 use X instead of Y"). One
          chip per candidate — typically 0 or 1, occasionally more. Placed
          ABOVE the heading because they represent a pre-read signal the
          student should see before engaging with the step's content.
          C-1 compact: suppressed in planning mode — the outline view is
          deliberately spare, branch signals belong to learning. */}
      {!isCompact && branchCandidates && branchCandidates.length > 0 && onBranchApply && onBranchDismiss ? (
        <AnimatePresence initial={false}>
          {branchCandidates.map((finding) => (
            <BranchChip
              key={finding.id}
              finding={finding}
              stepId={step.id}
              onApply={onBranchApply}
              onDismiss={onBranchDismiss}
            />
          ))}
        </AnimatePresence>
      ) : null}

      {/* Heading row is the click target — the h3 wraps the button so the
          heading remains semantic, and the button stays free of non-phrasing
          descendants (HTML requires button content to be phrasing-only).
          REFINE STEP chip reveals on hover when collapsed — Chunk B wires
          it to FOCUS_STEP, for now it stubs the click.
          DP1.7.C — heading text streams in via Typewriter, cascade-staggered
          from CanvasScreen via headingStartDelay (1.5s per step).
          DP1.7.G — when pending, heading dims to ~60% opacity and an alt
          "Generate this step" link sits beside the title. */}
      <div className="flex w-full items-center justify-between gap-3">
        <h3
          className={`font-heading m-0 text-base leading-snug text-leather md:text-lg flex-1 min-w-0 transition-opacity ${isPending && !isCompact ? 'opacity-60' : ''}`}
        >
          <button
            type="button"
            onClick={handleCardToggle}
            disabled={isCompact}
            aria-disabled={isCompact || undefined}
            className={`flex w-full items-start gap-3 text-left font-heading ${
              isCompact ? 'cursor-default' : ''
            }`}
          >
            <span className="mt-0.5 text-xs text-brand-400">
              {(stepIndex + 1).toString().padStart(2, '0')}
            </span>
            {/* layoutId shared with the Highway H1 (HighwayContent) so the
                heading text flies from this row position into the Highway
                display H1 when phase flips to 'focused'. focusMorph spring
                makes the ~22px → 42px size + tracking change read editorial. */}
            <motion.span
              layoutId={layoutIds.stepHeading(step.id)}
              transition={focusMorph}
              className="flex-1"
            >
              <Typewriter
                as="span"
                text={step.heading}
                startDelay={headingStartDelay}
              />
            </motion.span>
          </button>
        </h3>
        {!isCompact && isPending && onTriggerStep ? (
          <button
            type="button"
            onClick={handleTriggerStep}
            className="inline-flex shrink-0 items-center gap-1 type-label-s text-brand-400 hover:text-leather transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 rounded-sm"
          >
            <span>Show this step</span>
            <span aria-hidden>↘</span>
          </button>
        ) : null}
        {!isCompact && !isPending && !isExpanded ? (
          <div className="flex shrink-0 items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleRefineStep}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-brand-100 bg-warm-white px-3 type-label-s text-leather focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
              aria-label={`Refine step ${(stepIndex + 1).toString().padStart(2, '0')}: ${step.heading}`}
            >
              <span>Refine Step</span>
              <span aria-hidden>→</span>
            </button>
            {onRemoveStep ? (
              <button
                type="button"
                onClick={handleRemoveStep}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-brand-100 bg-warm-white text-brand-400 hover:text-red-500 hover:border-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 transition-colors"
                aria-label={`Remove step ${(stepIndex + 1).toString().padStart(2, '0')}: ${step.heading}`}
              >
                ×
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* DP1.5.G — block body.
          C-2 step 3 — gated behind isExpanded for READY content. The
          shimmer (generating state) still renders unconditionally so the
          labour-illusion during cascade is preserved: students see steps
          2–5 actively generating even while step 1 is the only expanded
          card. Once a step transitions to 'ready' and the student hasn't
          drilled in, the body folds away — chips below the heading carry
          the per-step summary. Walks back DP1.5's "always visible" rule
          intentionally because chips now fill the job DP1.5 was
          protecting (non-empty summary state).
          DP1.7.G — pending steps render nothing here (heading-only).
          C-1 — compact mode (planning) renders nothing here either; the
          plan view is heading-only by spec. */}
      {(() => {
        if (isCompact) return null
        if (isPending) return null
        const isShimmering =
          step.generationStatus === 'generating' ||
          (step.generationStatus === undefined && step.blocks === undefined)
        const hasReadyBlocks = step.blocks && step.blocks.length > 0
        const showReadyBlocks = isExpanded && hasReadyBlocks
        if (!isShimmering && !showReadyBlocks) return null
        return (
          <div className="pl-8 md:pl-9">
            <AnimatePresence initial={false}>
              {isShimmering ? (
                <motion.div
                  key="shimmer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <BlockShimmer />
                </motion.div>
              ) : showReadyBlocks ? (
                <motion.div
                  key="blocks"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  <BlockList
                    blocks={step.blocks ?? []}
                    onAllBlocksComplete={handleAllBlocksComplete}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )
      })()}

      {/* C-2 step 2 — Built for Mars "Hide-the-Advanced" pattern applied
          to per-step decision controls.
          The DP1.5 post-review specifically un-hid the BLOCK BODY because
          inline content makes the "everything visible" mental model right.
          That decision is preserved above (the BlockList renders regardless
          of isExpanded). What changes here is pill machinery only:
          - Collapsed (default): a thin row of summary chips shows what's
            currently picked for each decision (e.g. "TypeScript · Workers
            · Bearer"). The chips are read-only display; clicking the
            heading expands the step.
          - Expanded: the full StepPill rows + ResearchCard render exactly
            as before. Cycling, randomize, "Talk it through" all live here.
          Net effect: 5 steps × N pills each → 5 short chip lines instead
          of 5 stacks of "Pick one:" question rows. Density drops without
          walking back DP1.5's "blocks are inline" decision.
          DP1.7.G — pending steps suppress chips along with the block body
          so the deferred treatment stays heading-only.
          C-1 — compact mode (planning) likewise drops chip rows; the
          outline reads as a clean list of headings only. */}
      {!isCompact && !isPending && step.pills.length > 0 ? (
        <div className="pl-8 md:pl-9">
          {isExpanded ? (
            <div className="flex flex-col gap-3">
              {step.pills.map((pill) => {
                const definition = pillDefinitions[pill.decisionType]
                const question = definition?.question ?? 'Pick one:'
                const isOpen = reopenedDecision === pill.decisionType
                return (
                  <div
                    key={pill.decisionType}
                    className="flex w-full flex-col gap-2"
                  >
                    <StepPill
                      row={pill}
                      question={question}
                      options={pillOptionsByDecision[pill.decisionType] ?? []}
                      onPick={handlePick}
                      onRandomize={handleRandomize}
                      onReopen={handleReopen}
                      isOpen={isOpen}
                      rationale={definition?.rationale}
                      onAskAboutPill={
                        onAskAboutPill ? handleAskAboutPill : undefined
                      }
                    />
                    {/* ResearchCard stays behind the expand gate — it's the
                        detailed reasoning view, more verbose than the pill
                        chip itself. Keep it opt-in via expansion. */}
                    <AnimatePresence initial={false}>
                      <motion.div
                        key="research-card"
                        variants={stepExpandVariants}
                        initial="collapsed"
                        animate="expanded"
                        exit="collapsed"
                        transition={stepExpand}
                        className="overflow-hidden"
                      >
                        <ResearchCard
                          decisionType={pill.decisionType}
                          currentSelection={pill.selected}
                        />
                      </motion.div>
                    </AnimatePresence>
                  </div>
                )
              })}
            </div>
          ) : (
            <SummaryChipRow pills={step.pills} />
          )}
        </div>
      ) : null}
    </motion.article>
  )
}

// ----------------------------------------------------------------------------
// SummaryChipRow — read-only display of pill selections for collapsed cards.
// ----------------------------------------------------------------------------
//
// One chip per pill row. Picked values render as a solid capsule; null
// selections render as a dashed "Not picked" placeholder so the student can
// see at a glance which decisions are outstanding. The whole row is
// non-interactive — clicking the heading is the way to drill in. This keeps
// the keyboard tab order at exactly one stop per step (the heading button)
// and lets the chips function purely as a summary.

interface SummaryChipRowProps {
  pills: { decisionType: string; selected: string | null }[]
}

function SummaryChipRowImpl({ pills }: SummaryChipRowProps) {
  return (
    <div
      role="list"
      aria-label="Step decisions"
      className="flex flex-wrap items-center gap-1.5"
    >
      {pills.map((pill) => (
        <SummaryChip
          key={pill.decisionType}
          label={pill.selected}
        />
      ))}
    </div>
  )
}

const SummaryChipRow = memo(SummaryChipRowImpl)

interface SummaryChipProps {
  label: string | null
}

function SummaryChipImpl({ label }: SummaryChipProps) {
  if (!label) {
    return (
      <span
        role="listitem"
        className="inline-flex h-6 items-center rounded-full border border-dashed border-brand-200 bg-warm-white/60 px-2.5 text-[11px] italic text-brand-400"
      >
        Not picked
      </span>
    )
  }
  return (
    <span
      role="listitem"
      className="inline-flex h-6 items-center rounded-full border border-brand-50 bg-warm-white px-2.5 text-[11px] text-leather"
    >
      {label}
    </span>
  )
}

const SummaryChip = memo(SummaryChipImpl)

export const StepCard = memo(StepCardImpl)
