// ProjectIconCard — compact card for a single project inside a SpotifyRow.
//
// Visual: a horizontal card with a coloured monogram block on the left
// (project's first letter on a category-derived gradient) and the
// project's title + description + chips (time, difficulty) on the right.
// We deliberately don't try to source per-project artwork because the
// content repo references icon files that aren't generated locally —
// the monogram block fills that visual role with no asset dependency
// and ends up giving each card distinctness via the letter alone.
//
// Differentiating project rows from course rows visually is itself a
// design move: course rows = painted art (curated, atmospheric); project
// rows = text-first (informational, building blocks).

import type { IndividualProject } from '@/data/individualProjects'

const CATEGORY_GRADIENTS: Record<string, string> = {
  'Claude Code': 'linear-gradient(135deg, #4f3a82 0%, #2a1c52 100%)',
  Claude: 'linear-gradient(135deg, #d97757 0%, #8c3d2a 100%)',
  'AI Second Brain': 'linear-gradient(135deg, #5a7e6b 0%, #2c4639 100%)',
  'AI Design': 'linear-gradient(135deg, #6e5a82 0%, #3b2c52 100%)',
}

const FALLBACK_GRADIENT = 'linear-gradient(135deg, #58504D 0%, #2a2624 100%)'

export type ProjectIconCardTone = 'paper' | 'dark'

export interface ProjectIconCardProps {
  project: IndividualProject
  onSelect?: (project: IndividualProject) => void
  /** Background context — drives the surface color, border, and text hues
   *  so the card fits whether it's on the paper page or inside the dark
   *  browse panel. */
  tone?: ProjectIconCardTone
  /** When true, the card stretches to fill its parent cell instead of
   *  using the fixed 300px width. Use inside multi-row auto-fit grids
   *  (rows={2|3} on SpotifyRow) so cards consume the available column
   *  width rather than leaving sparse gaps. */
  wide?: boolean
}

export function ProjectIconCard({
  project,
  onSelect,
  tone = 'paper',
  wide = false,
}: ProjectIconCardProps) {
  const gradient = CATEGORY_GRADIENTS[project.category] ?? FALLBACK_GRADIENT
  const monogram = project.title.trim().charAt(0).toUpperCase()

  const isDark = tone === 'dark'

  // Surface, border, hover, and text classes change wholesale by tone so
  // the card reads cohesively against either ground without bleed.
  // Dark surface is the literal #2F2D2C from Paper artboard 4LA-0
  // (frame 4NI-0). Going solid (vs translucent white) lets each card
  // hold its own edge against the inky #1A1918 panel — the prior
  // bg-white/5 read as a faint stain rather than a discrete tile.
  const surfaceClass = isDark
    ? 'border-transparent bg-[#2F2D2C] hover:bg-[#3A3836] hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]'
    : 'border-[#ECE7DA] bg-warm-white hover:border-[#D9D2C5] hover:shadow-[0_8px_24px_-12px_rgba(27,25,24,0.18)]'

  const titleColor = isDark ? 'text-paper' : 'text-leather'
  const descColor = isDark ? 'text-white/60' : 'text-brand-500'
  const chipBg = isDark ? 'bg-white/8' : 'bg-brand-25'
  const chipText = isDark ? 'text-white/70' : 'text-brand-500'

  const widthClass = wide ? 'w-full' : 'w-[300px] shrink-0'

  const className = `group flex ${widthClass} items-stretch gap-3 rounded-[12px] border border-solid p-3 text-left transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-leather/40 ${surfaceClass}`

  const inner = (
    <>
      {/* Monogram block — square, gradient bg, big serif letter. */}
      <div
        aria-hidden="true"
        className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[10px]"
        style={{ backgroundImage: gradient }}
      >
        <span className="font-display text-[36px]/none font-medium text-white">
          {monogram}
        </span>
      </div>

      {/* Text block — title, description, chips at bottom. */}
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
        <div className="flex flex-col gap-1">
          <h3 className={`line-clamp-1 text-[14px]/[1.15] font-semibold ${titleColor}`}>
            {project.title}
          </h3>
          <p className={`line-clamp-2 text-[12px]/[1.35] ${descColor}`}>
            {project.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px]/[1.4] font-medium ${chipBg} ${chipText}`}>
            {project.time}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px]/[1.4] font-medium ${chipBg} ${chipText}`}>
            {project.difficulty}
          </span>
        </div>
      </div>
    </>
  )

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={() => onSelect(project)}
        aria-label={`${project.title} — ${project.description}`}
        className={className}
      >
        {inner}
      </button>
    )
  }

  return (
    <article aria-label={project.title} className={className}>
      {inner}
    </article>
  )
}
