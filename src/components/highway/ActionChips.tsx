// ActionChips — "Ask about this step · Bookmark · Explain simpler · Got stuck?"
//
// Reference: Paper artboard 2X8-0 node 2YD-0. First chip is filled dark (the
// primary action); the rest are outline. Chunk B wires the primary chip to
// open the step-scoped ask input below; the others log stubs for Chunk D+.

import { memo, useCallback } from 'react'

export interface ActionChipsProps {
  onAskAboutStep: () => void
  onBookmark?: () => void
  onExplainSimpler?: () => void
  onGotStuck?: () => void
}

function ActionChipsImpl({
  onAskAboutStep,
  onBookmark,
  onExplainSimpler,
  onGotStuck,
}: ActionChipsProps) {
  const handleBookmark = useCallback(() => {
    if (onBookmark) onBookmark()
    else console.log('[chip stub] bookmark')
  }, [onBookmark])
  const handleExplain = useCallback(() => {
    if (onExplainSimpler) onExplainSimpler()
    else console.log('[chip stub] explain simpler')
  }, [onExplainSimpler])
  const handleStuck = useCallback(() => {
    if (onGotStuck) onGotStuck()
    else console.log('[chip stub] got stuck')
  }, [onGotStuck])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onAskAboutStep}
        className="font-body inline-flex h-8 items-center rounded-full bg-leather px-4 text-sm text-paper hover:bg-leather/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
      >
        Ask about this step
      </button>
      <button
        type="button"
        onClick={handleBookmark}
        className="font-body inline-flex h-8 items-center rounded-full border border-brand-100 bg-warm-white px-4 text-sm text-leather hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
      >
        Bookmark
      </button>
      <button
        type="button"
        onClick={handleExplain}
        className="font-body inline-flex h-8 items-center rounded-full border border-brand-100 bg-warm-white px-4 text-sm text-leather hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
      >
        Explain simpler
      </button>
      <button
        type="button"
        onClick={handleStuck}
        className="font-body inline-flex h-8 items-center rounded-full border border-brand-100 bg-warm-white px-4 text-sm text-leather hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
      >
        Got stuck?
      </button>
    </div>
  )
}

export const ActionChips = memo(ActionChipsImpl)
