// ProgressDots — 5-step progress indicator for the Highway sticky header.
//
// Reference: Paper artboard 2X8-0 node 2XI-0. Five small horizontal bars,
// leftmost 1 filled leather (complete), the active step slightly longer,
// remaining dimmer. For Chunk B we treat "active step" as focusedStepIndex
// and mark steps < active as complete (visual heuristic); Chunk D replaces
// "complete" with an explicit refinedSteps prop so this reads accurately.

import { memo } from 'react'

export interface ProgressDotsProps {
  total: number
  /** 0-based index of the currently focused step. */
  active: number
}

function ProgressDotsImpl({ total, active }: ProgressDotsProps) {
  return (
    <div
      className="flex items-center gap-1.5"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={active + 1}
    >
      {Array.from({ length: total }).map((_, index) => {
        const isActive = index === active
        const isComplete = index < active
        return (
          <span
            key={index}
            aria-hidden
            className={
              isActive
                ? 'h-1 w-6 rounded-full bg-leather'
                : isComplete
                  ? 'h-1 w-4 rounded-full bg-leather'
                  : 'h-1 w-4 rounded-full bg-brand-100'
            }
          />
        )
      })}
    </div>
  )
}

export const ProgressDots = memo(ProgressDotsImpl)
