// SketchStatusPill — dark filled pill worn top-left of the project surface.
//
// Label: "● SKETCHING YOUR PROJECT" during sculpting, morphs to "● STEP 2 OF 5"
// inside Highway (Chunk C). Takes a string so the same component hosts both.
//
// The orange dot is --accent-clay, matching the Highway STEP-label treatment
// on Paper artboard 2X8-0. In the sculpting state the dot pulses slowly to
// read as "in progress" without demanding attention.
//
// layoutId="status-pill" is applied by the parent so the Chunk C morph can
// interpolate position + width between canvas and Highway without this
// component needing to know it's mid-morph.

import { motion } from 'motion/react'
import { memo } from 'react'

export interface SketchStatusPillProps {
  label: string
  /** Whether the dot animates a slow pulse. Defaults to true. */
  animatedDot?: boolean
}

function SketchStatusPillImpl({ label, animatedDot = true }: SketchStatusPillProps) {
  return (
    <span className="inline-flex h-7 items-center gap-2 rounded-full bg-leather px-3 text-paper type-label-s">
      <motion.span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: 'var(--accent-clay)' }}
        animate={
          animatedDot
            ? { opacity: [0.55, 1, 0.55] }
            : { opacity: 1 }
        }
        transition={
          animatedDot
            ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
            : undefined
        }
      />
      <span>{label}</span>
    </span>
  )
}

export const SketchStatusPill = memo(SketchStatusPillImpl)
