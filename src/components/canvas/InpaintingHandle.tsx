// InpaintingHandle — the fine-granularity refinement menu attached to each
// step card.
//
// Shape of AI pattern: Inpainting. The student selects a step and asks the
// AI to modify just that step's body without regenerating the whole plan.
// Four actions: Simplify / Extend / Rewrite / Regenerate.
//
// Interaction rules:
//   - Tap target is ≥44px (accessibility baseline for touch)
//   - Positioned top-right of the StepCard, absolute
//   - Menu opens on click, closes on outside tap or action choice
//   - Only visible when the StepCard is expanded OR pointer-hovered (the
//     parent StepCard passes isVisible so this component stays dumb)
//
// Keyboard: the trigger button is focusable and the menu items are
// regular buttons so native tab order works.

import { motion, AnimatePresence } from 'motion/react'
import { memo, useCallback, useState } from 'react'
import type { InpaintingAction } from '@/lib/state'
import { stepExpand } from '@/motion/springs'

type Action = Exclude<InpaintingAction, null>

interface MenuOption {
  id: Action
  label: string
  description: string
}

// Module-level constant — stable reference, no re-render churn.
const MENU_OPTIONS: MenuOption[] = [
  {
    id: 'simplify',
    label: 'Simplify',
    description: 'Fewer steps, plainer language, less jargon.',
  },
  {
    id: 'extend',
    label: 'Extend',
    description: 'Add more detail, validation, and context.',
  },
  {
    id: 'rewrite',
    label: 'Rewrite',
    description: 'Same scope, different phrasing and structure.',
  },
  {
    id: 'regenerate',
    label: 'Regenerate',
    description: 'Try a completely different approach.',
  },
]

export interface InpaintingHandleProps {
  /** When true, the handle is rendered; parent controls visibility so
      hover/focus logic can live at the StepCard level. */
  isVisible: boolean
  /** Fires when the student picks an action. */
  onAction: (action: Action) => void
}

function InpaintingHandleImpl({ isVisible, onAction }: InpaintingHandleProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleToggle = useCallback(() => {
    setIsMenuOpen((prev) => !prev)
  }, [])

  const handlePick = useCallback(
    (action: Action) => {
      setIsMenuOpen(false)
      onAction(action)
    },
    [onAction],
  )

  if (!isVisible) return null

  return (
    <div className="absolute right-2 top-2 z-10">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        aria-label="Refine this step"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-brand-50 bg-warm-white text-leather shadow-[var(--shadow-card)] hover:border-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
      >
        <span className="font-heading text-base leading-none" aria-hidden>
          ⌘
        </span>
      </button>

      <AnimatePresence>
        {isMenuOpen ? (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={stepExpand}
            role="menu"
            className="absolute right-0 top-12 flex w-64 flex-col gap-1 rounded-2xl border border-brand-50 bg-warm-white p-2 shadow-[var(--shadow-card)]"
          >
            {MENU_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitem"
                onClick={() => handlePick(option.id)}
                className="flex w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left hover:bg-brand-25 focus:outline-none focus-visible:bg-brand-25"
              >
                <span className="font-heading text-sm text-leather">
                  {option.label}
                </span>
                <span className="font-body text-xs leading-snug text-brand-500">
                  {option.description}
                </span>
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export const InpaintingHandle = memo(InpaintingHandleImpl)
