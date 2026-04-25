// MarqueeRow — one horizontal lane of tiles drifting at a constant speed.
//
// Implementation notes (motion principles, marketing context, Jakub +
// Jhey weighting):
//   - Continuous `linear` keyframes — anything bouncy fights the calm.
//   - Track is the project list duplicated TWICE so the loop seam is
//     invisible: translate from 0 → -50% of total width and the second
//     copy lands exactly where the first started.
//   - Pause-on-hover: lifts the lane from "wallpaper" to interactive.
//   - Reduced-motion: keyframes are paused, content stays visible.
//   - Per-row offset (`animationDelay: -Ns`) desynchronises rows so on
//     first paint they don't all start at column 0.
//
// Tiles inside are real <ProjectTileCard> buttons so each is keyboard-
// reachable; tabbing pauses the host row's animation via :focus-within
// (declared in the CSS class on the row).

import { useMemo } from 'react'
import {
  ProjectTileCard,
  type ProjectTileCardProps,
} from '@/components/discovery/ProjectTileCard'
import type { NextworkProject } from '@/data/nextworkProjects'

export interface MarqueeRowProps {
  projects: NextworkProject[]
  /** Loop length in seconds. 60-110s per the motion brief. */
  durationS: number
  /** Animation start offset so rows desync on first paint. */
  offsetS?: number
  direction: 'left' | 'right'
  onSelectProject?: ProjectTileCardProps['onClick']
  /** Pixel width of each tile slot. */
  tileWidth?: number
  /** Min total track width before duplication. Repeats the projects list
   *  if needed so even short filtered sets still fill the lane. */
  minTrackWidth?: number
}

export function MarqueeRow({
  projects,
  durationS,
  offsetS = 0,
  direction,
  onSelectProject,
  tileWidth = 220,
  minTrackWidth = 1800,
}: MarqueeRowProps) {
  const filled = useMemo(() => {
    if (projects.length === 0) return projects
    const perCopyWidth = projects.length * (tileWidth + 12)
    const repeats = Math.max(1, Math.ceil(minTrackWidth / perCopyWidth))
    const out: NextworkProject[] = []
    for (let i = 0; i < repeats; i += 1) out.push(...projects)
    return out
  }, [projects, tileWidth, minTrackWidth])

  if (filled.length === 0) return null

  return (
    <div className="marquee-row group/lane relative overflow-hidden py-1">
      <div
        className="marquee-track flex w-max gap-3"
        style={{
          animationName: direction === 'left' ? 'marquee-left' : 'marquee-right',
          animationDuration: `${durationS}s`,
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite',
          animationDelay: `${-Math.abs(offsetS)}s`,
        }}
      >
        {filled.map((project, index) => (
          <div
            key={`${project.id}-${index}`}
            className="shrink-0"
            style={{ width: `${tileWidth}px` }}
          >
            <ProjectTileCard project={project} onClick={onSelectProject} />
          </div>
        ))}
        {/* Duplicate copy for seamless loop — `aria-hidden` so screen
            readers don't double-announce every tile. */}
        <div
          aria-hidden="true"
          className="contents"
        >
          {filled.map((project, index) => (
            <div
              key={`dup-${project.id}-${index}`}
              className="shrink-0"
              style={{ width: `${tileWidth}px` }}
            >
              <ProjectTileCard project={project} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
