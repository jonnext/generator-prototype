// LearnFilterPills — five filter pills: All (default active), Roadmaps,
// Specialty, Tools, Moods. Toggling is local state; no real filtering
// logic for v1 (the Recommended cards below are stubs).
//
// Accessibility:
//   - Each pill is a real <button> with `aria-pressed` for active state.
//   - The pill row itself is a <div role="group" aria-label="…"> so
//     the pressed states are read as a group of toggle filters.
//
// Visual targets are h-7 = 28px per the Paper frame. That's under the
// ≥44px mobile tap-target guideline, which we're accepting for fidelity —
// the plan calls this out explicitly. A future critique round can add a
// padded hit-area without disturbing visual rhythm.
//
// Module-level per rerender-no-inline-components. PILLS is a module-scope
// const so its identity is stable across renders (no need to memoize).

import { useState, useCallback } from 'react'

const PILLS = ['All', 'Roadmaps', 'Specialty', 'Tools', 'Moods'] as const
type Pill = (typeof PILLS)[number]

export interface LearnFilterPillsProps {
  /** id forwarded to the row root so upstream <input aria-describedby> can point here. */
  id?: string
}

export function LearnFilterPills({ id }: LearnFilterPillsProps) {
  const [active, setActive] = useState<Pill>('All')

  const handleClick = useCallback((pill: Pill) => {
    setActive(pill)
  }, [])

  return (
    <div
      id={id}
      role="group"
      aria-label="Filter by learning type"
      className="flex gap-1.5"
    >
      {PILLS.map((pill) => {
        const isActive = active === pill
        return (
          <button
            key={pill}
            type="button"
            aria-pressed={isActive}
            onClick={() => handleClick(pill)}
            className={
              isActive
                ? 'flex h-7 items-center rounded-[14px] bg-[#1B1918] px-3 text-[11px]/3.5 font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1918]/30'
                : 'flex h-7 items-center rounded-[14px] bg-[#F0E9E6] px-3 text-[11px]/3.5 text-[#58504D] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1918]/30'
            }
          >
            {pill}
          </button>
        )
      })}
    </div>
  )
}
