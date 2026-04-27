// PlaceholderStepRow — DP1.8.D.2.
//
// Renders during the materializing phase BEFORE Phase A returns the real
// step skeleton. Replaces the previous static pulsing bars with a typewriter
// that types per-row labour-illusion copy, in NextWork agent-as-teammate
// voice. Cascades in via the same 1.5s stagger as DP1.7.C step heading
// reveal so the materializing phase feels continuous with the rest of the
// canvas choreography.
//
// When Phase A lands, CanvasScreen swaps these rows for real StepCards via
// AnimatePresence opacity crossfade — the actual headings then typewriter
// in via the existing DP1.7.C cascade.

import { memo } from 'react'
import { Typewriter } from '@/components/Typewriter'

const PLACEHOLDER_COPY: readonly string[] = [
  'Drafting step one…',
  'Mapping the second move…',
  'Working out the middle…',
  'Looking ahead to step four…',
  'Wrapping up the pathway…',
] as const

const TYPEWRITER_SPEED_MS = 45
const STAGGER_PER_STEP_MS = 1500

export interface PlaceholderStepRowProps {
  /** Zero-based index — drives both the displayed step number (01-...) and
   *  the cascade startDelay (cascadeStartMs + index * 1500ms). */
  stepIndex: number
  /** DP1.8.D.4 — base delay before the FIRST row's typewriter begins. Each
   *  row's individual delay is `cascadeStartMs + stepIndex * 1500ms`. Lets
   *  CanvasScreen sequence the placeholder cascade after the header + metadata
   *  reveal. Defaults to 0 so older callers still cascade from t=0. */
  cascadeStartMs?: number
}

function PlaceholderStepRowImpl({ stepIndex, cascadeStartMs = 0 }: PlaceholderStepRowProps) {
  const stepNumber = (stepIndex + 1).toString().padStart(2, '0')
  const copy = PLACEHOLDER_COPY[stepIndex] ?? PLACEHOLDER_COPY[PLACEHOLDER_COPY.length - 1]

  return (
    <div
      className="flex w-full items-center gap-4 rounded-2xl border border-brand-50 bg-warm-white px-4 py-5 shadow-[var(--shadow-card)]"
      aria-hidden
    >
      <span className="font-body text-xs text-brand-400">{stepNumber}</span>
      <Typewriter
        as="span"
        text={copy}
        speedMs={TYPEWRITER_SPEED_MS}
        startDelay={cascadeStartMs + stepIndex * STAGGER_PER_STEP_MS}
        className="font-heading text-sm text-brand-400 md:text-base"
      />
    </div>
  )
}

export const PlaceholderStepRow = memo(PlaceholderStepRowImpl)
