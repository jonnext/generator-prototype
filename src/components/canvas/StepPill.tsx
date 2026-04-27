// StepPill — the fine-granularity decision control. One pill row represents
// one decision the student (or the AI) has to make for a given step, e.g.
// "Which container service?" or "Which API framework?".
//
// Shape of AI patterns this component implements:
//   - Parameters: explicit option set the student picks from
//   - Randomize ("I don't know, you tell me"): a first-class option that
//     surfaces the AI rationale from copy.ts inline when picked
//
// Key behavioral rule from the critique:
//   "Every pill row MUST include an I don't know, you tell me option"
//
// Once the student has chosen, the row collapses to a compact "chip" that
// shows the selection and the rationale (if AI picked). Re-tapping re-opens
// the options inline. No modals, no popovers.

import { motion, AnimatePresence } from 'motion/react'
import { memo, useCallback } from 'react'
import type { StepPillRow } from '@/lib/state'
import { layoutShift, stepExpand } from '@/motion/springs'

// The canonical "I don't know" option id. Using a sentinel so the row
// rendering code can distinguish it from real options without string-match
// fragility in downstream consumers.
export const RANDOMIZE_OPTION_ID = '__randomize__'

export interface StepPillProps {
  /** Raw pill row from state — selected may be null before any choice. */
  row: StepPillRow
  /** Prompt question shown above the options, e.g. "Which container service?". */
  question: string
  /** Options the student can pick from. The Randomize entry is appended. */
  options: { id: string; label: string }[]
  /** Fires when the student picks a real option. aiPicked=false. */
  onPick: (decisionType: string, selected: string) => void
  /** Fires when the student picks "I don't know". aiPicked=true, selected
      resolves to the rationale's chosen option from copy.ts. */
  onRandomize: (decisionType: string) => void
  /** Fires when the student taps the chip to re-open the option list. */
  onReopen: (decisionType: string) => void
  /** Whether the row is currently open (showing all options) or collapsed
      to a chosen-chip. Derived by the parent StepCard from its own state. */
  isOpen: boolean
  /**
   * Rationale body shown when the student picked "I don't know" and the
   * selection came from the AI. Sourced from ActionPlan.pillDefinitions in
   * the parent (per RP1 — no longer looked up from copy.ts). Undefined when
   * no rationale is available; the chip renders without the explanation.
   */
  rationale?: string
  /**
   * DP1.8.A.2 — "Talk it through →" escape hatch. Fires when the student
   * taps the link below the options row. The handler in App opens the chat
   * tray with a seeded system message that names the decision so the
   * assistant can walk through trade-offs and (optionally) suggest a fourth
   * option. Optional: when undefined, the link is suppressed (e.g. legacy
   * test mounts that don't wire chat).
   */
  onAskAboutPill?: (decisionType: string) => void
}

function StepPillImpl({
  row,
  question,
  options,
  onPick,
  onRandomize,
  onReopen,
  isOpen,
  rationale,
  onAskAboutPill,
}: StepPillProps) {
  const { decisionType, selected, aiPicked } = row

  // Rationale is only shown when the current selection came from Randomize.
  // Passed in via prop from the plan's pillDefinitions map (RP1).
  const rationaleBody = aiPicked ? rationale : undefined

  const handlePick = useCallback(
    (optionId: string) => {
      if (optionId === RANDOMIZE_OPTION_ID) {
        onRandomize(decisionType)
      } else {
        onPick(decisionType, optionId)
      }
    },
    [decisionType, onPick, onRandomize],
  )

  const handleReopen = useCallback(() => {
    onReopen(decisionType)
  }, [decisionType, onReopen])

  const handleAsk = useCallback(() => {
    onAskAboutPill?.(decisionType)
  }, [decisionType, onAskAboutPill])

  return (
    <motion.div
      layout
      transition={layoutShift}
      className="flex w-full flex-col gap-2"
      role="group"
      aria-label={question}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isOpen || selected === null ? (
          <motion.div
            key="open"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={stepExpand}
            className="flex w-full flex-col gap-2"
          >
            <p className="font-body text-xs font-semibold text-leather">
              {question}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {options.map((opt) => {
                const isSelected = opt.id === selected
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handlePick(opt.id)}
                    aria-pressed={isSelected}
                    className={
                      isSelected
                        ? 'font-body rounded-full bg-leather px-3 py-1.5 text-xs text-paper'
                        : 'font-body rounded-full border border-brand-50 bg-warm-white px-3 py-1.5 text-xs text-leather hover:border-brand-200'
                    }
                  >
                    {opt.label}
                  </button>
                )
              })}
              {/* Randomize option — first-class, not hidden behind a menu. */}
              <button
                type="button"
                onClick={() => handlePick(RANDOMIZE_OPTION_ID)}
                className="font-body rounded-full border border-dashed border-brand-200 bg-transparent px-3 py-1.5 text-xs text-brand-500 hover:border-brand-300 hover:text-leather"
              >
                I don’t know, you tell me
              </button>
            </div>
            {/* DP1.8.A.2 — "Talk it through →" escape hatch. Tertiary
                affordance below the option row that pre-seeds the chat tray
                with this decision's context. Suppressed when the parent
                doesn't wire onAskAboutPill so legacy test mounts still
                render cleanly. */}
            {onAskAboutPill ? (
              <button
                type="button"
                onClick={handleAsk}
                className="font-body self-start text-xs uppercase tracking-[0.12em] text-brand-400 hover:text-leather focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 rounded-sm"
                aria-label={`Talk through ${question}`}
              >
                Talk it through →
              </button>
            ) : null}
          </motion.div>
        ) : (
          <motion.button
            key="chosen"
            type="button"
            layout
            onClick={handleReopen}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={stepExpand}
            className="group flex w-full flex-col gap-1 rounded-xl border border-brand-50 bg-warm-white px-3 py-2 text-left hover:border-brand-200"
          >
            <span className="font-body flex items-center gap-2 text-xs text-brand-400">
              {question}
              {aiPicked ? (
                <span className="font-body rounded-full bg-brand-25 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-brand-500">
                  AI picked
                </span>
              ) : null}
            </span>
            <span className="font-heading text-sm text-leather">
              {selected}
            </span>
            {rationaleBody ? (
              <span className="font-body mt-1 text-xs leading-relaxed text-brand-500">
                {rationaleBody}
              </span>
            ) : null}
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export const StepPill = memo(StepPillImpl)
