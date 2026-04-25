// ResearchPulse — DP1.5.H.
//
// Surfaces that the research agent is actively working. Copy is deliberately
// agent-as-teammate per the plan's Strategic Framing section — "Researching…"
// first-person-ish, not "Loading…" or "Fetching data…". The goal is to make
// the student feel like a teammate is doing work alongside them, not that
// a spinner is stalling.
//
// Activates whenever Phase R has at least one in-flight adapter call. App.tsx
// owns the boolean; ResearchPulse only renders. Fade in/out + a gentle
// ping animation on the indicator dot. Honours prefers-reduced-motion via
// Tailwind's motion-safe prefix on the ping utility.

import { motion, AnimatePresence } from 'motion/react'
import { memo } from 'react'

export interface ResearchPulseProps {
  active: boolean
}

function ResearchPulseImpl({ active }: ResearchPulseProps) {
  return (
    <AnimatePresence initial={false}>
      {active ? (
        <motion.div
          key="research-pulse"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-2 rounded-full border border-brand-100 bg-warm-white/90 px-3 py-1.5 shadow-sm backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-brand-300 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
          </span>
          <span className="type-label-s text-leather">Researching…</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export const ResearchPulse = memo(ResearchPulseImpl)
