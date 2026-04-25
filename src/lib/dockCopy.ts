// Dock copy state machine — drives the bottom Toolbar's hint text.
//
// Today (Chunk A): returns the sculpting-state copy. Chunk D extends this to
// transition through step-refining / step-refined / all-refined as the student
// drills into Highway and picks decisions.
//
// Kept as a pure function so the Toolbar can call it inline — no React state,
// no effects. The inputs are whatever the Toolbar already reads from the
// engine, which today is just the phase enum.

import type { Phase } from './state'

export type DockCopyInput = {
  phase: Phase
  /** Present intent text — used as a fallback when we haven't materialized yet. */
  intent?: string
  /** Number of steps with a resolvedSummary set. Chunk D will wire this. */
  refinedCount?: number
  /** Total steps in the plan (typically 5). Chunk D will wire this. */
  totalSteps?: number
}

export function getDockCopy(input: DockCopyInput): string {
  const { phase, intent, refinedCount = 0, totalSteps = 5 } = input

  switch (phase) {
    case 'discovery':
      return intent?.trim() || 'What do you want to build?'
    case 'materializing':
      return 'Sketching your project…'
    case 'learning':
      if (refinedCount === 0) {
        return 'All five steps ready — tap any to begin, or ask me to adjust the plan'
      }
      if (refinedCount < totalSteps) {
        return `${refinedCount} of ${totalSteps} steps shaped — keep going, or ask me to adjust the plan`
      }
      return 'All five steps shaped — keep going or add another'
    case 'focused':
      return 'Refining one step — pick decisions or ask me anything'
    default:
      return intent?.trim() || ''
  }
}
