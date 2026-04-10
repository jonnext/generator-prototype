// StepCard — one row of the project plan.
//
// Collapsed state: heading + compact pill summary + inpainting handle (on
// hover/focus/expanded). Tap the card to expand and reveal:
//   - full body paragraph (streams in during generating phase)
//   - full-width StepPill rows (one per decision)
//   - ResearchCard (lazy) per pill row for option comparisons
//
// Composition follows the Shape of AI "Shared Vision + Controls" pattern:
// the card is the shared vision, the pills + inpainting handle are the
// controls the student uses to shape it.
//
// Per rerender-no-inline-components every sub-piece is a module-level
// component or an imported component. Per rerender-use-ref-transient-values
// the hover tracking uses a ref and `onPointerEnter` / `onPointerLeave` to
// reveal the inpainting handle without re-rendering on every pointer move.

import { motion, AnimatePresence } from 'motion/react'
import { memo, useCallback, useMemo, useState } from 'react'
import type { InpaintingAction, Step } from '@/lib/state'
import { researchComparisons } from '@/lib/copy'
import { StepPill } from './StepPill'
import { ResearchCard } from './ResearchCard'
import { InpaintingHandle } from './InpaintingHandle'
import {
  inpaintingDissolve,
  inpaintingResolve,
  stepExpand,
} from '@/motion/springs'
import { stepExpandVariants } from '@/motion/choreography'

export interface StepCardProps {
  step: Step
  /** Whether the card is in the expanded state (body + pills visible). */
  isExpanded: boolean
  onExpand: (stepId: string) => void
  onCollapse: (stepId: string) => void
  /** Fine-granularity pill setter, forwarded from useStepChoices. */
  onPickPill: (stepId: string, decisionType: string, selected: string) => void
  /** Randomize delegate — resolves the "I don't know" choice to the AI pick. */
  onRandomizePill: (stepId: string, decisionType: string) => void
  /** Inpainting start — parent wires this to startInpainting + Claude. */
  onStartInpainting: (stepId: string, action: Exclude<InpaintingAction, null>) => void
}

function StepCardImpl({
  step,
  isExpanded,
  onExpand,
  onCollapse,
  onPickPill,
  onRandomizePill,
  onStartInpainting,
}: StepCardProps) {
  // isHovered drives the InpaintingHandle visibility when NOT expanded.
  // When expanded, the handle is always visible. We keep this as local
  // state (not a ref) because render-time visibility is what changes —
  // the transient-ref guideline is for values the UI does not read at
  // render time.
  const [isHovered, setIsHovered] = useState(false)
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

  const handleInpainting = useCallback(
    (action: Exclude<InpaintingAction, null>) => {
      onStartInpainting(step.id, action)
    },
    [onStartInpainting, step.id],
  )

  const handlePointerEnter = useCallback(() => setIsHovered(true), [])
  const handlePointerLeave = useCallback(() => setIsHovered(false), [])

  // Derive pill option lists during render from the researchComparisons copy.
  // Each comparison's options[].name is the option id. Memoize keyed by the
  // pills' decisionTypes so a chat tray pulse doesn't re-walk the table.
  const pillOptionsByDecision = useMemo(() => {
    const map: Record<string, { id: string; label: string }[]> = {}
    for (const pill of step.pills) {
      const comparison = researchComparisons[pill.decisionType]
      map[pill.decisionType] = comparison
        ? comparison.options.map((opt) => ({ id: opt.name, label: opt.name }))
        : []
    }
    return map
  }, [step.pills])

  const isInpainting = step.inpainting !== null

  return (
    <motion.article
      layout
      transition={stepExpand}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className="relative flex w-full flex-col gap-3 rounded-2xl border border-brand-50 bg-warm-white p-4 shadow-[var(--shadow-card)]"
      aria-expanded={isExpanded}
    >
      <InpaintingHandle
        isVisible={isExpanded || isHovered}
        onAction={handleInpainting}
      />

      {/* Heading row is the click target — the h3 wraps the button so the
          heading remains semantic, and the button stays free of non-phrasing
          descendants (HTML requires button content to be phrasing-only). */}
      <h3 className="font-heading m-0 text-base leading-snug text-leather md:text-lg">
        <button
          type="button"
          onClick={handleCardToggle}
          className="flex w-full items-start gap-3 text-left font-heading"
        >
          <span className="mt-0.5 text-xs text-brand-400">
            {stepIndexFromId(step.id)}
          </span>
          <span className="flex-1">{step.heading}</span>
        </button>
      </h3>

      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            key="body"
            variants={stepExpandVariants}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            transition={stepExpand}
            className="flex flex-col gap-4 overflow-hidden"
          >
            {/* Body paragraph — streams in during generating phase. The
                inpainting overlay dissolves the body when an action runs. */}
            <div className="relative min-h-[1rem]">
              <AnimatePresence mode="wait">
                {isInpainting ? (
                  <motion.div
                    key="inpainting"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 0.35 }}
                    exit={{ opacity: 1 }}
                    transition={inpaintingDissolve}
                    className="font-body text-sm leading-relaxed text-brand-400"
                  >
                    {step.body || '…'}
                    <span className="font-body ml-2 text-xs uppercase tracking-[0.1em] text-brand-300">
                      {step.inpainting}…
                    </span>
                  </motion.div>
                ) : (
                  <motion.p
                    key="body-text"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={inpaintingResolve}
                    className="font-body text-sm leading-relaxed text-leather"
                  >
                    {step.body ||
                      'We are shaping this step. Pick your preferences below and we will fill in the details.'}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Pill rows — one per decision this step attaches. */}
            {step.pills.length > 0 ? (
              <div className="flex flex-col gap-3 border-t border-brand-50 pt-3">
                {step.pills.map((pill) => {
                  const comparison = researchComparisons[pill.decisionType]
                  const question = comparison?.question ?? 'Pick one:'
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
                      />
                      <ResearchCard
                        decisionType={pill.decisionType}
                        currentSelection={pill.selected}
                      />
                    </div>
                  )
                })}
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  )
}

export const StepCard = memo(StepCardImpl)

// ----------------------------------------------------------------------------
// Helper — derive a 2-digit step number from the step id. Kept local to
// StepCard so the id format stays a StepCard concern.
// ----------------------------------------------------------------------------

function stepIndexFromId(id: string): string {
  const match = id.match(/(\d+)/)
  if (!match) return '—'
  const n = parseInt(match[1], 10)
  return n.toString().padStart(2, '0')
}
