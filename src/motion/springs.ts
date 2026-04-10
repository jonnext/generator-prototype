// Spring presets for Motion. One source of truth so every interaction in the
// canvas pulls from the same physics vocabulary. Values come from the
// choreography table in the plan (crystalline-roaming-volcano.md).
//
// Usage:
//   import { motion } from 'motion/react'
//   import { springs } from '@/motion/springs'
//   <motion.div animate={{ x: 0 }} transition={springs.sharedElement} />

import type { Transition } from 'motion/react'

/** Chat input morph from Discovery to docked — plan: stiffness 200, damping 25. */
export const sharedElement: Transition = {
  type: 'spring',
  stiffness: 200,
  damping: 25,
  mass: 1,
}

/** ProjectHeader materialize — fade + 0.95 → 1.0 scale. Plan: ~300ms. */
export const materialize: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 26,
  mass: 1,
}

/** Step card stream-in (one card, per-item). Staggered externally. Plan: 400ms per card. */
export const stepStreamIn: Transition = {
  type: 'spring',
  stiffness: 240,
  damping: 28,
  mass: 1,
}

/** FLIP layout shift for metadata row + affected steps. Plan: stiffness 300, damping 28. */
export const layoutShift: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 28,
  mass: 1,
}

/** Step expand on tap — height auto + internal content fade. Plan: 250ms. */
export const stepExpand: Transition = {
  type: 'spring',
  stiffness: 340,
  damping: 30,
  mass: 1,
}

/** Chat tray slide-up + backdrop fade. Plan: stiffness 220, damping 24. */
export const trayOpen: Transition = {
  type: 'spring',
  stiffness: 220,
  damping: 24,
  mass: 1,
}

/** Inpainting content dissolve — softer feel so regenerating reads as "remix". */
export const inpaintingDissolve: Transition = {
  type: 'tween',
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1],
}

/** Inpainting content resolve after regenerate completes. Plan: ~400ms. */
export const inpaintingResolve: Transition = {
  type: 'spring',
  stiffness: 220,
  damping: 28,
  mass: 1,
}

/** Reduced-motion replacement: cheap linear fades, no spring, no translate. */
export const reducedLinear: Transition = {
  type: 'tween',
  duration: 0.15,
  ease: 'linear',
}

/** Stagger step delay for stream-in. Plan: 40-80ms between cards, total ≤ 600ms. */
export const STEP_STAGGER_SEC = 0.06
