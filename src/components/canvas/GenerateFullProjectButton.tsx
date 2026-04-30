// GenerateFullProjectButton — Session B (ChatGPT Canvas / Bolt.new) inline
// reveal CTA.
//
// While CanvasScreen's local `outlinePreview` flag is true, the canvas runs
// in a low-ceremony preview: heading-only StepCards, no MetadataRow, the
// architecture diagram still anchoring above as the centerpiece. This button
// is the user's commit gesture — tapping it flips outlinePreview to false
// and the canvas rehydrates into today's full StepCard chrome (block body,
// pill rows, ResearchCard on expand).
//
// Visual brief: deliberately less ceremonial than ContinueStepCTA. That CTA
// is a centered card with a kicker label and a shadowed action button — it
// announces "this is THE moment to commit step N+1". This one is an inline
// pill that sits flush under the last step heading, indented to align with
// the body content gutter (pl-8 / md:pl-9, matching StepCard's body indent).
// The visual weight is closer to a chip than to a primary action.
//
// Reveal timing: parent passes `revealDelaySec` so the button fades in only
// after the heading cascade has finished typing — the user reads the outline
// first, then the affordance arrives. Reduced-motion bypasses the delay
// entirely and lands the button in its final state on mount.

import { motion } from 'motion/react'
import { memo } from 'react'

export interface GenerateFullProjectButtonProps {
  /** Click handler — flips outlinePreview to false in the parent. */
  onGenerate: () => void
  /**
   * Seconds to wait before fading the button in. Computed by CanvasScreen
   * as the cascade end (last heading start + ~typing buffer). 0 under
   * reduced-motion so it appears immediately.
   */
  revealDelaySec: number
}

function GenerateFullProjectButtonImpl({
  onGenerate,
  revealDelaySec,
}: GenerateFullProjectButtonProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: revealDelaySec,
        duration: 0.35,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="flex justify-start pt-1 pl-8 md:pl-9"
    >
      <button
        type="button"
        onClick={onGenerate}
        className="group inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-warm-white/60 px-3 py-1.5 font-body text-sm text-leather hover:border-brand-300 hover:bg-warm-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
        aria-label="Generate the full project from this outline"
      >
        <span>Generate full project</span>
        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </button>
    </motion.div>
  )
}

export const GenerateFullProjectButton = memo(GenerateFullProjectButtonImpl)
