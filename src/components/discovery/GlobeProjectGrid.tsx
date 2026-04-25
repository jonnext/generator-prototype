// GlobeProjectGrid — circular-masked "planet" of project tiles.
//
// 2026-04-25 (round 3): refactored to a uniform planet feel per Jon's
// note that varied speeds + alternating directions read as visual chaos
// rather than richness. Now:
//   • All rows drift in the SAME direction at the SAME base speed →
//     reads as one rotating planet rather than competing marquees.
//   • Tiles are uniform 16:9 at a denser size → density carries the
//     "visually rich" feel (Paper frame `2VJ-0` "Globe Explore
//     experience" had ~20 tiles visible inside one circle).
//   • Container is full-width of its parent column with a slight right-
//     edge bleed so the planet feels celestial rather than contained.
//
// Mask is `border-radius: 50%` + `overflow: hidden` (cheaper than
// `mask-image: radial-gradient` for a hard circular edge). The moving
// inner content stays GPU-composited via `transform: translate3d`.

import { useMemo } from 'react'
import { MarqueeRow } from '@/components/discovery/MarqueeRow'
import type { ProjectFilter } from '@/components/discovery/CategoryFilterRow'
import {
  NEXTWORK_PROJECTS,
  type NextworkProject,
} from '@/data/nextworkProjects'

// Eight rows for density. All same direction. Speeds vary by under 10%
// of the base — just enough to keep the planet from feeling mechanical,
// not enough to read as competing marquees.
const ROW_COUNT = 8
const ROW_BASE_SPEED = 110 // seconds per loop
const ROW_OFFSETS = [0, 17, 34, 51, 9, 26, 43, 60] // desync starts

export interface GlobeProjectGridProps {
  filter: ProjectFilter
  onSelectProject?: (project: NextworkProject) => void
}

export function GlobeProjectGrid({ filter, onSelectProject }: GlobeProjectGridProps) {
  const visible = useMemo(
    () =>
      filter === 'All'
        ? NEXTWORK_PROJECTS
        : NEXTWORK_PROJECTS.filter((project) => project.track === filter),
    [filter],
  )

  const rows = useMemo(
    () => stripeIntoRows(visible, ROW_COUNT),
    [visible],
  )

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Planet — square box masked into a circle. We size it bigger
          than the parent column (125%) and translate it slightly right
          so it feels like a celestial body bleeding past the viewport
          edge rather than a contained widget. */}
      <div
        className="absolute top-1/2 right-[-12%] aspect-square w-[125%] -translate-y-1/2 overflow-hidden rounded-full bg-warm-white"
        style={{
          // Soft inner edge so the circle reads as a planet's terminator
          // rather than a hard cookie cutter.
          boxShadow:
            'inset 0 0 0 1px rgba(27,25,24,0.04), inset -40px 0 80px rgba(27,25,24,0.06), inset 0 -60px 120px rgba(27,25,24,0.05)',
        }}
      >
        <div className="absolute inset-0 flex flex-col justify-center gap-2.5 px-3">
          {rows.map((row, index) => (
            <MarqueeRow
              key={index}
              projects={row}
              // ±5% variation around the base, all going the same way.
              durationS={ROW_BASE_SPEED + (index % 3) * 4 - 4}
              offsetS={ROW_OFFSETS[index] ?? 0}
              direction="left"
              tileWidth={180}
              minTrackWidth={2400}
              onSelectProject={onSelectProject}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Distribute projects across N rows by striping (round-robin) so every
 *  row carries variety even when the catalogue is small.  */
function stripeIntoRows(
  projects: NextworkProject[],
  rowCount: number,
): NextworkProject[][] {
  const rows: NextworkProject[][] = Array.from({ length: rowCount }, () => [])
  projects.forEach((project, index) => {
    rows[index % rowCount]!.push(project)
  })
  return rows
}
