// BuildButton — the commit affordance next to the project title.
//
// Semantics (post-Saturday critique, Thread 5):
//
//   Generate (in Toolbar, owned by Team B): student expresses intent, Claude
//     drafts the skeleton — title, 5 step headings, pills. Step bodies are
//     intentionally empty ("We are shaping this step…" placeholder).
//   Build   (this button, owned by Team C): after sculpting with pills /
//     mode / chat, student commits. Phase flips sculpting -> build ->
//     generating -> complete while step bodies stream in.
//
// The button visually matches the Toolbar's "Create" button (leather bg,
// paper text, heading type, 44px tap target, rounded-xl) so students read
// Build as equivalently load-bearing to Generate. The two buttons are
// intentional mirrors of each other across the two-phase commit.
//
// Rules honored:
//  - rerender-no-inline-components: module-level, memoized.
//  - rerender-hoist-jsx: the label branch (idle / building) is a pure
//    expression on props, no inline JSX passed through children.
//  - usePrefersReducedMotion: the hover lift is suppressed under reduced
//    motion so nothing bobs under the student's cursor.

import { motion } from 'motion/react'
import { memo, useCallback, type KeyboardEvent } from 'react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

export interface BuildButtonProps {
  /** Fires on click or Enter/Space. */
  onClick: () => void
  /**
   * Disable when the student hasn't sculpted enough to build yet. Default
   * false — sculpting is technically optional, the plan just wants the
   * affordance to be available throughout the sculpting phase.
   */
  disabled?: boolean
  /**
   * True while phase is 'build' or 'generating'. Swaps the label to
   * "Building…" and locks the button so a second click can't re-fire the
   * stream. Reduced-motion users still see the label change — it's not
   * a motion affordance, it's state communication.
   */
  isBuilding?: boolean
}

function BuildButtonImpl({
  onClick,
  disabled = false,
  isBuilding = false,
}: BuildButtonProps) {
  const prefersReducedMotion = usePrefersReducedMotion()

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        if (!disabled && !isBuilding) {
          onClick()
        }
      }
    },
    [disabled, isBuilding, onClick],
  )

  // The label branch is a pure string — no inline JSX. rerender-hoist-jsx.
  const label = isBuilding ? 'Building…' : 'Build'

  // The button is effectively locked while building — we keep aria-disabled
  // truthy so screen readers announce the state, but leave the element
  // focusable so the user's tab order isn't disturbed mid-stream.
  const isInert = disabled || isBuilding

  // Under reduced motion we skip the hover lift entirely. Under normal
  // motion we use a small y translate (-1px) and scale bump — the Motion
  // docs call this "micro-feedback", and it keeps hover affordance
  // distinguishable from focus without overpowering the title.
  const hoverAnimation = prefersReducedMotion
    ? undefined
    : { y: -1, scale: 1.02 }
  const tapAnimation = prefersReducedMotion ? undefined : { scale: 0.98 }

  return (
    <motion.button
      type="button"
      onClick={isInert ? undefined : onClick}
      onKeyDown={handleKeyDown}
      disabled={isInert}
      aria-disabled={isInert}
      aria-label={isBuilding ? 'Building your project' : 'Build this project'}
      whileHover={isInert ? undefined : hoverAnimation}
      whileTap={isInert ? undefined : tapAnimation}
      className="font-heading inline-flex min-h-[44px] shrink-0 items-center rounded-xl bg-leather px-5 text-sm text-paper shadow-[var(--shadow-card)] transition-colors hover:bg-leather/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {label}
    </motion.button>
  )
}

export const BuildButton = memo(BuildButtonImpl)
