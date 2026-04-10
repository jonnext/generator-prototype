// Motion variants — Koch-style choreography sequences. Reusable across
// ProjectHeader, StepCard, ChatTray. Keeps components declarative:
//   <motion.div variants={stepCardVariants} initial="hidden" animate="visible" />

import type { Variants } from 'motion/react'
import {
  layoutShift,
  materialize,
  stepExpand,
  stepStreamIn,
  trayOpen,
  STEP_STAGGER_SEC,
} from './springs'

/** Parent that staggers its children's entrance by STEP_STAGGER_SEC. */
export const staggerParentVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: STEP_STAGGER_SEC,
      delayChildren: 0.05,
    },
  },
}

/** ProjectHeader — fade in with micro scale. */
export const projectHeaderVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: materialize,
  },
}

/** Step card — 8px translateY + fade. Used as a child of staggerParent. */
export const stepCardVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: stepStreamIn,
  },
}

/** Step expand — height auto + content fade. Motion animates height via layout. */
export const stepExpandVariants: Variants = {
  collapsed: { opacity: 0, height: 0 },
  expanded: {
    opacity: 1,
    height: 'auto',
    transition: stepExpand,
  },
}

/** Chat tray: slide from bottom, opacity up. */
export const chatTrayVariants: Variants = {
  closed: { y: '100%', opacity: 0 },
  open: {
    y: 0,
    opacity: 1,
    transition: trayOpen,
  },
}

/** Metadata row pill swap (FLIP reinforcement). Motion's `layout` handles the
 *  geometry; this variant handles the opacity flicker so the swap reads. */
export const metadataPillVariants: Variants = {
  initial: { opacity: 0.6 },
  settled: {
    opacity: 1,
    transition: layoutShift,
  },
}

/** Reduced-motion override: every entrance is a cheap fade. */
export const reducedMotionVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.15, ease: 'linear' },
  },
  collapsed: { opacity: 0, height: 0 },
  expanded: { opacity: 1, height: 'auto', transition: { duration: 0.15 } },
  closed: { opacity: 0 },
  open: { opacity: 1, transition: { duration: 0.15 } },
}
