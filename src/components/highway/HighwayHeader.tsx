// HighwayHeader — sticky top bar for the focused-step view.
//
// Reference: Paper artboard 2X8-0 node 2X9-0. Four regions laid out
// edge-to-edge with a 1440-wide container: ← Shape link (far left), dark
// "● STEP N OF TOTAL" pill + plan title (center-left group), ProgressDots +
// total minutes (far right).
//
// The status pill wears layoutId="status-pill" (shared with canvas's
// SketchStatusPill) so Chunk C's morph interpolates content + position
// between "● SKETCHING YOUR PROJECT" and "● STEP 2 OF 5".

import { motion } from 'motion/react'
import { memo } from 'react'
import { layoutIds } from '@/motion/transitions'
import { focusMorph } from '@/motion/springs'
import { SketchStatusPill } from '@/components/canvas/SketchStatusPill'
import { ProgressDots } from './ProgressDots'

export interface HighwayHeaderProps {
  planTitle: string
  /** 0-based focused step index. */
  stepIndex: number
  totalSteps: number
  /** Total project minutes — from the skeleton's timeMinutes. */
  totalMinutes?: number
  onExit: () => void
}

function HighwayHeaderImpl({
  planTitle,
  stepIndex,
  totalSteps,
  totalMinutes,
  onExit,
}: HighwayHeaderProps) {
  const humanStepIndex = stepIndex + 1
  const stepLabel = `STEP ${humanStepIndex} OF ${totalSteps}`

  return (
    <header className="sticky top-0 z-20 w-full border-b border-brand-50 bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={onExit}
            className="font-body text-xs uppercase tracking-[0.12em] text-brand-400 hover:text-leather focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 rounded px-1"
            aria-label="Back to plan"
          >
            ← Shape
          </button>
          <span aria-hidden className="h-4 w-px bg-brand-100" />
          <motion.div layoutId={layoutIds.statusPill} transition={focusMorph}>
            <SketchStatusPill label={stepLabel} />
          </motion.div>
          <span className="font-body truncate text-sm text-brand-500 min-w-0">
            {planTitle}
          </span>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <ProgressDots total={totalSteps} active={stepIndex} />
          {typeof totalMinutes === 'number' ? (
            <span className="type-label-s text-brand-400">
              {totalMinutes} MIN
            </span>
          ) : null}
        </div>
      </div>
    </header>
  )
}

export const HighwayHeader = memo(HighwayHeaderImpl)
