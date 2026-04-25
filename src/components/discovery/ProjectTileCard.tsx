// ProjectTileCard — single painted-art tile shown inside the Globe grid.
//
// Geometry from Paper frame `2VJ-0` "Globe Explore experience": ~225×125
// with the title sitting bottom-left in white semibold. We render a soft
// vertical gradient overlay so the title stays legible across diverse
// painted backgrounds (auroras, deserts, snow, harbours).
//
// The label is the project title rather than the placeholder Beginner /
// AI/ML / PRO badges from the original mock. Real course titles communicate
// what the student will build; the placeholder badges did not.

import type { NextworkProject } from '@/data/nextworkProjects'

export interface ProjectTileCardProps {
  project: NextworkProject
  onClick?: (project: NextworkProject) => void
  /** Tailwind-friendly width override for layout containers. */
  className?: string
}

const SHARED_CLASS =
  'group relative flex aspect-[16/9] items-end overflow-hidden rounded-[10px] p-2.5 text-left shadow-[0_8px_24px_-12px_rgba(27,25,24,0.35)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.015] focus:outline-none focus-visible:ring-2 focus-visible:ring-leather/40'

export function ProjectTileCard({ project, onClick, className }: ProjectTileCardProps) {
  const style = {
    backgroundImage: `url("${project.image}")`,
    backgroundSize: 'cover' as const,
    backgroundPosition: 'center' as const,
  }

  const overlay = (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/0"
      />
      <span className="relative line-clamp-2 text-[13px]/[1.15] font-semibold tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
        {project.title}
      </span>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={() => onClick(project)}
        aria-label={`${project.title}${project.description ? ` — ${project.description}` : ''}`}
        className={SHARED_CLASS + (className ? ` ${className}` : '')}
        style={style}
      >
        {overlay}
      </button>
    )
  }

  return (
    <article
      aria-label={project.title}
      className={SHARED_CLASS + (className ? ` ${className}` : '')}
      style={style}
    >
      {overlay}
    </article>
  )
}
