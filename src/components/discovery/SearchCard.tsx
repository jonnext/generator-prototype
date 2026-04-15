// SearchCard — the upper surface of the new NextWork Discovery entry
// point, matching Paper frame `HV-0` "nextwork-starting point".
//
// Shape (top → bottom):
//   1. ExplorePathPill          (top-right dark pill)
//   2. LearnSearchInput         (magnifying glass + "I want to learn…")
//   3. LearnFilterPills         (All | Roadmaps | Specialty | Tools | Moods)
//   4. "RECOMMENDED · Show more" label row
//   5. Three RecommendedCard gradient tiles
//
// Positioning: the Paper frame draws the card `absolute bottom-17 left-[50%]`
// inside a 1440×900 artboard. In the live prototype we port that to
// `fixed bottom-17 left-1/2 -translate-x-1/2` so the card docks to the
// viewport above the Toolbar nav bar (Team B owns the nav bar at
// `bottom-1` + `h-13`, which leaves a 16px gap with `bottom-17`).
//
// Width: the frame specifies `w-180` (720px). On viewports narrower than
// that we fall back to 100% minus horizontal padding so the card doesn't
// overflow on mobile — the same pattern the existing content highway uses.
//
// State: SearchCard owns the search input value locally since it's a leaf
// for the generator — submit routes out via the `onSubmit` prop. Filter
// pill state lives inside LearnFilterPills (it doesn't affect anything
// outside the pill row for v1).
//
// Rerender discipline:
//   - Every child is a module-level component (no inline JSX factories).
//   - Derived values (nothing here needs useMemo) are computed in render.
//   - Gradient strings live at module scope so their string identity is
//     stable across renders and they don't allocate per-render objects.
//   - LearnSearchInput's controlled value is plain useState — no effect
//     mirrors (rerender-derived-state-no-effect).

import { useCallback, useId, useState } from 'react'
import { ExplorePathPill } from '@/components/discovery/ExplorePathPill'
import { LearnSearchInput } from '@/components/discovery/LearnSearchInput'
import { LearnFilterPills } from '@/components/discovery/LearnFilterPills'
import { RecommendedCard } from '@/components/discovery/RecommendedCard'

// ---- Gradient stops lifted from Paper frame `HV-0` ---------------------
//
// The frame's source JSX used OKLab color space which Tailwind v4 can't
// express as an arbitrary value, so we inline the sRGB equivalents as
// plain `linear-gradient(...)` strings. Exact OKLab values are captured
// in RecommendedCard.tsx's JSDoc block for future fidelity tuning.
const BEGINNER_GRADIENT =
  'linear-gradient(135deg, #1f4a30 0%, #0f2618 100%)'
const AI_ML_GRADIENT = 'linear-gradient(135deg, #6b3819 0%, #3a1e0e 100%)'
const PRO_GRADIENT = 'linear-gradient(135deg, #2e1e6e 0%, #170e3a 100%)'

export interface SearchCardProps {
  /**
   * Called when the student presses Enter in the "I want to learn…" input
   * with a non-empty value. Team C (Thread 3) wires this up from App.tsx
   * to the same `handleGenerate` the Toolbar's Generate morph will call.
   */
  onSubmit: (value: string) => void
}

export function SearchCard({ onSubmit }: SearchCardProps) {
  const [searchValue, setSearchValue] = useState('')

  // Stable ids for aria wiring (input ↔ filter-pill group describedby).
  const reactId = useId()
  const inputId = `search-card-input-${reactId}`
  const filterId = `search-card-filters-${reactId}`

  const handleSubmit = useCallback(
    (value: string) => {
      onSubmit(value)
      // Keep the field populated so Team C can reuse the value on the
      // canvas side — the reducer owns the canonical intent once this
      // fires, but leaving the local value avoids a flash of empty state
      // if the animation rolls back.
    },
    [onSubmit],
  )

  return (
    <section
      aria-label="Explore and learn"
      className="fixed bottom-17 left-1/2 flex w-[min(720px,calc(100%-32px))] -translate-x-1/2 flex-col gap-4 rounded-[20px] border border-solid border-[#E5DEDA] bg-white px-6 py-5"
      style={{
        boxShadow: '0px 8px 24px -4px rgba(27, 25, 24, 0.10)',
      }}
    >
      <ExplorePathPill />

      <LearnSearchInput
        value={searchValue}
        onChange={setSearchValue}
        onSubmit={handleSubmit}
        inputId={inputId}
        describedById={filterId}
      />

      <LearnFilterPills id={filterId} />

      <div className="flex items-center justify-between">
        <span className="text-[10px]/3 font-semibold uppercase tracking-[0.5px] text-[#9E8F88]">
          Recommended
        </span>
        <span className="text-[11px]/3.5 text-[#6C615C]">Show more</span>
      </div>

      <div className="flex gap-2.5">
        <RecommendedCard title="Beginner" gradient={BEGINNER_GRADIENT} />
        <RecommendedCard title="AI/ML" gradient={AI_ML_GRADIENT} />
        <RecommendedCard title="PRO" gradient={PRO_GRADIENT} />
      </div>
    </section>
  )
}
