// StartBuildingCTA — C-1 Plan-Then-Build (Pattern B, Replit-style).
//
// The explicit pre-commit handshake. Mounted at the bottom of the canvas
// while phase === 'planning': the student has read the architecture
// diagram + heading-only step outline and is now choosing — deliberately —
// to flip the canvas into the learning surface. Tapping fires the
// `onStartBuilding` callback, which CanvasScreen wires to setPhase('learning').
//
// Visual model (per artboard 5D2-0 — "the leverage point"):
//   - Centered, full-width chrome that reads as a deliberate commit, not
//     a passive "next" affordance. Solid leather-on-paper button rather
//     than the Continue CTA's lighter card chrome.
//   - Helper text above the button — short, second-person, names the
//     transition explicitly so the student knows what's about to happen.
//   - Single arrow glyph trailing the label so the chrome echoes the
//     existing ContinueStepCTA grammar without copying its exact shape.
//
// Lives inside `flex flex-col gap-6` of CanvasScreen, sits below the step
// list and above any future trailing affordances. Reduced motion users
// get the same chrome — Motion's fade is a cheap one-off entrance, not a
// loop, so prefers-reduced-motion compliance is satisfied by the existing
// stagger guard upstream.

import { motion } from 'motion/react'
import { memo, useCallback } from 'react'

export interface StartBuildingCTAProps {
  /** Fired on click. CanvasScreen wires this to setPhase('learning') so
   *  the canvas advances into the full learning surface and the existing
   *  reveal cascade + modular Phase B continues from where planning paused. */
  onStartBuilding: () => void
  /** Disabled while the skeleton hasn't landed yet (no plan to commit to).
   *  CanvasScreen sets this to actionPlan === null. */
  disabled?: boolean
}

function StartBuildingCTAImpl({
  onStartBuilding,
  disabled = false,
}: StartBuildingCTAProps) {
  const handleClick = useCallback(() => {
    if (disabled) return
    onStartBuilding()
  }, [disabled, onStartBuilding])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="flex w-full flex-col items-center gap-2 pt-2"
    >
      <span className="font-body text-xs uppercase tracking-[0.12em] text-brand-300">
        Ready when you are
      </span>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="inline-flex w-full max-w-md items-center justify-center gap-2 rounded-2xl border border-leather bg-leather px-5 py-3 font-heading text-sm tracking-[0.01em] text-paper shadow-[var(--shadow-card)] transition-colors hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-leather"
        aria-label="Start building this project"
      >
        <span>Start building</span>
        <span aria-hidden className="shrink-0">→</span>
      </button>
    </motion.div>
  )
}

export const StartBuildingCTA = memo(StartBuildingCTAImpl)
