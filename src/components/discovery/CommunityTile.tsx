// Single community project tile shown in the Discovery grid.
//
// Defined at module level (never inside another component) per
// rerender-no-inline-components. Wrapped in memo so a typing session that
// only changes the filtered list's length doesn't re-render tiles whose
// props are unchanged.

import { memo } from 'react'
import { motion } from 'motion/react'
import type { SeedProject } from '@/lib/seedProjects'
import { modes } from '@/lib/copy'

export interface CommunityTileProps {
  project: SeedProject
  onSelect: (project: SeedProject) => void
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`
}

function modeLabel(modeId: SeedProject['mode']): string {
  return modes.find((m) => m.id === modeId)?.name ?? modeId
}

function CommunityTileImpl({ project, onSelect }: CommunityTileProps) {
  return (
    <motion.button
      layout
      type="button"
      onClick={() => onSelect(project)}
      className="group flex h-full w-full flex-col items-start gap-3 rounded-2xl border border-brand-50 bg-warm-white p-5 text-left shadow-[var(--shadow-card)] transition-colors hover:border-brand-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leather"
    >
      <div className="flex w-full items-center justify-between">
        <span className="font-body inline-flex items-center rounded-full bg-brand-25 px-2.5 py-1 text-xs uppercase tracking-wide text-brand-500">
          {project.category}
        </span>
        <span className="font-body text-xs text-brand-400">
          {formatMinutes(project.estimatedMinutes)}
        </span>
      </div>

      <h3 className="font-heading text-lg leading-snug text-leather">
        {project.title}
      </h3>

      <p className="font-body text-sm leading-relaxed text-brand-500">
        {project.description}
      </p>

      <span className="font-body mt-auto inline-flex items-center gap-1 text-xs text-brand-400">
        {modeLabel(project.mode)}
      </span>
    </motion.button>
  )
}

export const CommunityTile = memo(CommunityTileImpl)
