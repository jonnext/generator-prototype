// ProjectHeader — the canvas header that persists across phases. It holds
// the kicker badge, the project title, and a one-line description.
//
// The whole header wraps a single motion.div with layoutId="project-header"
// so when the canvas re-lays out during phase transitions (step cards
// appearing, chat tray docking, etc.) the header stays anchored and Motion
// animates any size/position deltas via FLIP.
//
// DP1 removed the Build button — the dynamic-pathway model has no terminal
// commit moment. Top-right slot is intentionally empty until DP6 wires Share.

import { motion } from 'motion/react'
import { memo } from 'react'
import { layoutIds } from '@/motion/transitions'
import { projectHeaderVariants } from '@/motion/choreography'
import { focusMorph, sharedElement } from '@/motion/springs'
import { SketchStatusPill } from '@/components/canvas/SketchStatusPill'
import { Typewriter } from '@/components/Typewriter'
import type { Phase } from '@/lib/state'

const TYPEWRITER_SPEED_MS = 30
const DESCRIPTION_OVERLAP_MS = 200

export interface ProjectHeaderProps {
  /** Status text shown in the top-left pill ("Sketching your project", etc.). */
  statusLabel: string
  title: string
  description: string
  /** Current phase — kept on the prop surface for future status decoration. */
  phase: Phase
}

function ProjectHeaderImpl({
  statusLabel,
  title,
  description,
}: ProjectHeaderProps) {
  return (
    <motion.header
      layoutId={layoutIds.projectHeader}
      layout="position"
      transition={sharedElement}
      variants={projectHeaderVariants}
      initial="hidden"
      animate="visible"
      className="flex w-full flex-col items-start gap-5"
    >
      <div className="flex w-full items-center justify-between gap-4">
        <motion.div layoutId={layoutIds.statusPill} transition={focusMorph}>
          <SketchStatusPill label={statusLabel} />
        </motion.div>
      </div>
      <Typewriter
        as="h1"
        text={title}
        speedMs={TYPEWRITER_SPEED_MS}
        className="type-display-xl text-leather"
      />
      <p className="font-heading max-w-prose text-brand-500" style={{ fontSize: 'var(--text-reading)', lineHeight: 'var(--leading-reading)' }}>
        {/* startDelay = title typing duration + small overlap so description begins as title finishes */}
        <Typewriter
          text={description}
          speedMs={TYPEWRITER_SPEED_MS}
          startDelay={title.length * TYPEWRITER_SPEED_MS + DESCRIPTION_OVERLAP_MS}
        />
      </p>
    </motion.header>
  )
}

export const ProjectHeader = memo(ProjectHeaderImpl)
