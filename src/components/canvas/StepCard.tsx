// StepCard — one row of the project plan.
//
// Collapsed state: heading + Refine Step chip on hover.
// Expanded state: full-width StepPill rows (one per decision) + ResearchCards.
//
// DP1 collapsed the build/generating phases — there are no streamed step
// bodies anymore. Pill shaping is the only expanded affordance until DP3
// reintroduces validation blocks for living documentation.

import { motion, AnimatePresence } from 'motion/react'
import { memo, useCallback, useMemo, useState } from 'react'
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
}: StepCardProps) {
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
  const chromeClass = isExpanded
    ? 'rounded-2xl border border-brand-50 bg-warm-white p-4 shadow-[var(--shadow-card)]'
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
          student should see before engaging with the step's content. */}
      {branchCandidates && branchCandidates.length > 0 && onBranchApply && onBranchDismiss ? (
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
          className={`font-heading m-0 text-base leading-snug text-leather md:text-lg flex-1 min-w-0 transition-opacity ${isPending ? 'opacity-60' : ''}`}
        >
          <button
            type="button"
            onClick={handleCardToggle}
            className="flex w-full items-start gap-3 text-left font-heading"
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
        {isPending && onTriggerStep ? (
          <button
            type="button"
            onClick={handleTriggerStep}
            className="inline-flex shrink-0 items-center gap-1 type-label-s text-brand-400 hover:text-leather transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 rounded-sm"
          >
            <span>Generate this step</span>
            <span aria-hidden>↘</span>
          </button>
        ) : null}
        {!isPending && !isExpanded ? (
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

      {/* DP1.5.G — block body. Always visible below the heading once Phase
          B has populated step.blocks. Shimmer stands in until then so the
          card height is stable during research + generation. The block
          layer sits BETWEEN the heading (click target) and the pill rows
          (expanded-only) — students read the step's actual content without
          needing to expand.
          DP1.5.H — shimmer → blocks crossfade via AnimatePresence. `mode`
          is omitted so the exiting shimmer and entering blocks briefly
          overlap; the container's natural min-height prevents height jump.
          DP1.7.G — render switches on generationStatus:
            • 'pending'    → render nothing (heading-only deferred treatment).
            • 'generating' → BlockShimmer.
            • 'ready'      → BlockList.
            • undefined    → legacy fallback (shimmer until blocks populate). */}
      {isPending ? null : (
        <div className="pl-8 md:pl-9">
          <AnimatePresence initial={false}>
            {step.generationStatus === 'generating' || (step.generationStatus === undefined && step.blocks === undefined) ? (
              <motion.div
                key="shimmer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <BlockShimmer />
              </motion.div>
            ) : step.blocks && step.blocks.length > 0 ? (
              <motion.div
                key="blocks"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <BlockList blocks={step.blocks} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      )}

      {/* DP1.5 post-review — pill rows render ALWAYS below the block body.
          In DP1 pills were the primary shaping surface and lived behind a
          click-to-expand toggle. Now that blocks are inline (DP1.5.G), the
          student's mental model is "I can see everything" — hiding pills
          behind hover feels broken. The expand/collapse machinery is kept
          (isExpanded + onExpand/onCollapse) for future drill-in behavior
          but no longer gates pill visibility.
          Padding matches the block layer's pl-8 md:pl-9 so pills align
          with content under the heading text, not the step number.
          DP1.7.G — pending steps suppress pills along with the block body
          so the deferred treatment is heading-only. */}
      {!isPending && step.pills.length > 0 ? (
        <div className="flex flex-col gap-3 pl-8 md:pl-9">
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
                />
                {/* ResearchCard stays behind the expand gate — it's the
                    detailed reasoning view, more verbose than the pill
                    chip itself. Keep it opt-in via expansion. */}
                <AnimatePresence initial={false}>
                  {isExpanded ? (
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
                  ) : null}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      ) : null}
    </motion.article>
  )
}

export const StepCard = memo(StepCardImpl)
