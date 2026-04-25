// ContinueStepCTA — DP1.7.F.
//
// The between-steps affordance that commits the next pending step. Rendered
// by CanvasScreen between adjacent StepCards whenever the latest-ready step
// is followed by a pending one. Tapping fires App's handleTriggerNextStep
// with the target stepIndex — the same callback that powers the pending-
// step alt link inside StepCard (DP1.7.G), so both surfaces converge on a
// single commit path.
//
// Visibility logic lives in CanvasScreen (not here): CTA mounts when
// step.generationStatus === 'ready' AND the next step is 'pending'. We do
// NOT gate on the typewriter cascade-complete event — see the DP1.7.F plan
// notes for why (sculpt-refresh path doesn't re-fire it; revealing the CTA
// during typing actually signals "more is coming" which is on-brand).

import { motion } from 'motion/react'
import { memo, useCallback } from 'react'

export interface ContinueStepCTAProps {
  /** 0-based array index of the step that's about to be generated. */
  nextStepIndex: number
  nextStepHeading: string
  /** Fires App's handleTriggerNextStep with nextStepIndex. */
  onTrigger: (stepIndex: number) => void
}

function ContinueStepCTAImpl({
  nextStepIndex,
  nextStepHeading,
  onTrigger,
}: ContinueStepCTAProps) {
  const handleClick = useCallback(() => {
    onTrigger(nextStepIndex)
  }, [onTrigger, nextStepIndex])

  // Match the existing "STEP 01" badge convention — 1-based + zero-padded.
  const stepLabel = (nextStepIndex + 1).toString().padStart(2, '0')

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex w-full flex-col items-center gap-2 py-2"
    >
      <span className="font-body text-xs uppercase tracking-[0.12em] text-brand-300">
        ↓ when you&rsquo;re ready
      </span>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex max-w-full items-center gap-2 rounded-xl border border-brand-50 bg-paper px-4 py-2.5 font-body text-sm text-leather shadow-[var(--shadow-card)] hover:border-brand-300 hover:bg-warm-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
        aria-label={`Continue to step ${stepLabel}: ${nextStepHeading}`}
      >
        <span className="truncate">
          Continue to step {stepLabel}: {nextStepHeading}
        </span>
        <span aria-hidden className="shrink-0">→</span>
      </button>
    </motion.div>
  )
}

export const ContinueStepCTA = memo(ContinueStepCTAImpl)
