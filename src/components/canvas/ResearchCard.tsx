// ResearchCard — lazy-loaded option comparison card.
//
// Collapsed by default, showing only the "compare options →" affordance.
// When the student taps it, Suspense boundary shows a tiny skeleton while
// React.lazy pulls ResearchCardContent on demand. Per bundle-dynamic-imports
// this keeps the heavy comparison table out of the initial bundle.
//
// Per async-suspense-boundaries the Suspense fallback is a structural
// skeleton, not a generic spinner — it reserves the same layout box the
// comparison will occupy so opening the card doesn't jank the step card.

import { motion, AnimatePresence } from 'motion/react'
import { lazy, memo, Suspense, useState, useCallback } from 'react'
import { stepExpand } from '@/motion/springs'

// Direct dynamic import — per bundle-barrel-imports and
// bundle-dynamic-imports. Default export so React.lazy can unwrap it.
const ResearchCardContent = lazy(
  () => import('./ResearchCardContent'),
)

export interface ResearchCardProps {
  decisionType: string
  /** Selection passed through to highlight the current option in the table. */
  currentSelection: string | null
}

function ResearchCardImpl({ decisionType, currentSelection }: ResearchCardProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  // Warm the lazy chunk on hover/focus so the first tap is instant.
  // Per bundle-preload: "preload on hover/focus for perceived speed."
  // The promise is fire-and-forget — React.lazy caches the module.
  const handlePrefetch = useCallback(() => {
    void import('./ResearchCardContent')
  }, [])

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-brand-50 bg-warm-white p-3">
      <button
        type="button"
        onClick={handleToggle}
        onPointerEnter={handlePrefetch}
        onFocus={handlePrefetch}
        aria-expanded={isOpen}
        className="font-body flex items-center justify-between text-xs text-leather hover:text-brand-500"
      >
        <span>
          {isOpen ? 'Hide comparison' : 'Compare options'}
        </span>
        <span
          className="font-body text-brand-400"
          aria-hidden
          style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 160ms' }}
        >
          →
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={stepExpand}
            className="overflow-hidden"
          >
            <Suspense fallback={<ResearchCardSkeleton />}>
              <div className="pt-3">
                <ResearchCardContent
                  decisionType={decisionType}
                  currentSelection={currentSelection}
                />
              </div>
            </Suspense>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export const ResearchCard = memo(ResearchCardImpl)

// Structural skeleton — 3 stacked option blocks sized to match the content.
// Module-level per rerender-no-inline-components.
function ResearchCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 pt-3" aria-hidden>
      <div className="h-3 w-32 rounded-full bg-brand-25" />
      <div className="h-24 rounded-xl border border-brand-50 bg-warm-white" />
      <div className="h-24 rounded-xl border border-brand-50 bg-warm-white" />
      <div className="h-24 rounded-xl border border-brand-50 bg-warm-white" />
    </div>
  )
}
