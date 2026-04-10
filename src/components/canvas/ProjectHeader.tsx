// ProjectHeader — the canvas header that persists across all four phases
// (materializing, sculpting, generating, complete). It holds the kicker
// badge, the project title, and a one-line description.
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

export interface ProjectHeaderProps {
  badge: string
  title: string
  description: string
}

function ProjectHeaderImpl({ badge, title, description }: ProjectHeaderProps) {
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
      <h1 className="font-heading text-3xl leading-tight tracking-tight text-leather md:text-4xl">
        {title}
      </h1>
      <p className="font-body max-w-prose text-sm leading-relaxed text-brand-500 md:text-base">
        {description}
      </p>
    </motion.header>
  )
}

export const ProjectHeader = memo(ProjectHeaderImpl)
