// ProjectGrid — uniform-tile grid that fills the page below the
// Discovery header. Matches Paper frame `31R-0` "Explore Starting Point"
// where 5-6 columns of identical 16:9 painted-art tiles fill the lower
// half of the screen.
//
// Filtering: the active CategoryFilter from the row above narrows the
// visible set. Document order is preserved (the data file is hand-
// ordered); we don't reshuffle per filter so cards don't visually
// thrash when the student toggles.
//
// Column count is breakpoint-driven rather than auto-fit so the tile
// rhythm stays predictable across viewports — matching the Paper layout
// at desktop and degrading sensibly down to phone widths.

import { useMemo } from 'react'
import {
  NEXTWORK_PROJECTS,
  type NextworkProject,
} from '@/data/nextworkProjects'
import {
  ProjectTileCard,
  type ProjectTileCardProps,
} from '@/components/discovery/ProjectTileCard'
import type { ProjectFilter } from '@/components/discovery/CategoryFilterRow'

export interface ProjectGridProps {
  filter: ProjectFilter
  onSelectProject?: ProjectTileCardProps['onClick']
}

export function ProjectGrid({ filter, onSelectProject }: ProjectGridProps) {
  const visible = useMemo(
    () =>
      filter === 'All'
        ? NEXTWORK_PROJECTS
        : NEXTWORK_PROJECTS.filter((project) => project.track === filter),
    [filter],
  )

  return (
    <div className="grid w-full grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {visible.map((project: NextworkProject) => (
        <ProjectTileCard
          key={project.id}
          project={project}
          onClick={onSelectProject}
        />
      ))}
    </div>
  )
}
