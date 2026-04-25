// CategoryFilterRow — quieter taxonomy filter (All / Roadmaps / Specialty
// / Tools) that sits between the eyebrow label and the project grid.
//
// Differs from the old LearnFilterPills in two ways: (1) "Moods" is
// dropped to match the Paper design, and (2) the active state is a soft
// warm chip rather than a dark inverted one — this row is secondary
// navigation, not a primary CTA, so it deserves quieter weight.
//
// State is owned here and pushed up via `onChange` so ProjectGrid can
// filter against it. Default selection is "All".

import { useCallback } from 'react'
import type { ProjectTrack } from '@/data/nextworkProjects'

export type ProjectFilter = 'All' | ProjectTrack

const FILTERS: ProjectFilter[] = ['All', 'Roadmaps', 'Specialty', 'Tools']

export interface CategoryFilterRowProps {
  active: ProjectFilter
  onChange: (next: ProjectFilter) => void
  /** Optional id for aria wiring from upstream describedby. */
  id?: string
}

export function CategoryFilterRow({
  active,
  onChange,
  id,
}: CategoryFilterRowProps) {
  const handleClick = useCallback(
    (filter: ProjectFilter) => onChange(filter),
    [onChange],
  )

  return (
    <div
      id={id}
      role="group"
      aria-label="Filter projects by track"
      className="flex flex-wrap justify-center gap-1.5"
    >
      {FILTERS.map((filter) => {
        const isActive = active === filter
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={isActive}
            onClick={() => handleClick(filter)}
            className={
              isActive
                ? 'flex h-7 items-center rounded-[14px] bg-brand-25 px-3 text-[11px]/3.5 text-[#58504D] outline outline-1 outline-[#ACACAC] focus:outline-none focus-visible:ring-2 focus-visible:ring-leather/30'
                : 'flex h-7 items-center rounded-[14px] px-3 text-[11px]/3.5 text-[#58504D] transition-colors hover:bg-brand-25/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-leather/30'
            }
          >
            {filter}
          </button>
        )
      })}
    </div>
  )
}
