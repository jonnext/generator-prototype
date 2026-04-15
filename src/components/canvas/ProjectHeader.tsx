// ProjectHeader — the canvas header that persists across all five phases
// (materializing, sculpting, build, generating, complete). It holds the
// kicker badge, the project title, and a one-line description — and as of
// Thread 5, a Build button floated to the top-right of the title row.
//
// The whole header wraps a single motion.div with layoutId="project-header"
// so when the canvas re-lays out during phase transitions (step cards
// appearing, chat tray docking, etc.) the header stays anchored and Motion
// animates any size/position deltas via FLIP.
//
// Per rerender-no-inline-components this component is module-level and
// wrapped in React.memo so a parent re-render (e.g. chat tray pulse tick)
// does not invalidate the header tree.

import { motion } from 'motion/react'
import { memo } from 'react'
import { layoutIds } from '@/motion/transitions'
import { projectHeaderVariants } from '@/motion/choreography'
import { sharedElement } from '@/motion/springs'
import { BuildButton } from '@/components/canvas/BuildButton'
import type { Phase } from '@/lib/state'

export interface ProjectHeaderProps {
  badge: string
  title: string
  description: string
  /** Current phase — controls whether the Build button is visible and its label state. */
  phase: Phase
  /** Fires when the student taps Build. The parent flips phase sculpting -> build -> generating. */
  onBuild: () => void
}

// BuildButton visibility rule: show it from sculpting onwards (the plan
// skeleton is live so the student has something to commit). Hide during
// materializing (skeleton cards haven't landed yet) and after complete
// (nothing left to build). During build and generating we keep it visible
// in its isBuilding state so the student sees the commit in flight.
function shouldShowBuildButton(phase: Phase): boolean {
  return (
    phase === 'sculpting' || phase === 'build' || phase === 'generating'
  )
}

function shouldShowBuildingLabel(phase: Phase): boolean {
  return phase === 'build' || phase === 'generating'
}

function ProjectHeaderImpl({
  badge,
  title,
  description,
  phase,
  onBuild,
}: ProjectHeaderProps) {
  const showBuild = shouldShowBuildButton(phase)
  const isBuilding = shouldShowBuildingLabel(phase)

  return (
    <motion.header
      layoutId={layoutIds.projectHeader}
      layout="position"
      transition={sharedElement}
      variants={projectHeaderVariants}
      initial="hidden"
      animate="visible"
      className="flex w-full flex-col items-start gap-3"
    >
      <span className="font-body text-[11px] uppercase tracking-[0.14em] text-brand-400">
        {badge}
      </span>
      <div className="flex w-full items-start justify-between gap-4">
        <h1 className="font-heading text-3xl leading-tight tracking-tight text-leather md:text-4xl">
          {title}
        </h1>
        {showBuild ? (
          <BuildButton onClick={onBuild} isBuilding={isBuilding} />
        ) : null}
      </div>
      <p className="font-body max-w-prose text-sm leading-relaxed text-brand-500 md:text-base">
        {description}
      </p>
    </motion.header>
  )
}

export const ProjectHeader = memo(ProjectHeaderImpl)
