// CourseTile — painted-art card for a course series in a SpotifyRow.
//
// Differs from the older `ProjectTileCard` (which targets a uniform CSS
// grid) in two ways: (1) fixed pixel width so it sits cleanly inside an
// `overflow-x-auto` track without competing with grid sizing, and (2)
// a slightly bigger title block so the painted art reads as editorial
// rather than thumbnail-scale.

import type { NextworkProject } from '@/data/nextworkProjects'

export interface CourseTileProps {
  series: NextworkProject
  onSelect?: (series: NextworkProject) => void
}

export function CourseTile({ series, onSelect }: CourseTileProps) {
  const className =
    'group relative flex aspect-[16/10] w-[260px] shrink-0 items-end overflow-hidden rounded-[12px] p-3 text-left shadow-[0_8px_24px_-12px_rgba(27,25,24,0.35)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.015] focus:outline-none focus-visible:ring-2 focus-visible:ring-leather/40'
  const style = {
    backgroundImage: `url("${series.image}")`,
    backgroundSize: 'cover' as const,
    backgroundPosition: 'center' as const,
  }
  const overlay = (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-black/0"
      />
      <div className="relative flex flex-col gap-0.5">
        <span className="text-[15px]/[1.15] font-semibold tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
          {series.title}
        </span>
        {series.description ? (
          <span className="line-clamp-1 text-[12px]/[1.3] text-white/80">
            {series.description}
          </span>
        ) : null}
      </div>
    </>
  )

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={() => onSelect(series)}
        aria-label={`${series.title}${series.description ? ` — ${series.description}` : ''}`}
        className={className}
        style={style}
      >
        {overlay}
      </button>
    )
  }

  return (
    <article aria-label={series.title} className={className} style={style}>
      {overlay}
    </article>
  )
}
