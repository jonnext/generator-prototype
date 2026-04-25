// HighwayDock — bottom navigation + step-scoped ask input.
//
// Reference: Paper artboard 2X8-0 node 2YC-0. Three regions on one pill:
//   ← Step N-1 (previous, muted when at first step)
//   | Ask a question about {topic}… | (the step-scoped chat input)
//   Done · Step N+1 →  (advance to next; on the last step, label is
//                        "Done · Back to plan →" and routes to onExit)
//
// For Chunk B the chat input is a stub — it logs on submit. Chunk D wires
// dispatchStepChat through it. The prev/next buttons are fully wired today
// because they're cheap and they let Jon test arrow-key + tap traversal
// end-to-end on first load.

import { memo, useCallback, useState, type FormEvent, type KeyboardEvent } from 'react'

export interface HighwayDockProps {
  stepTopic: string
  /** 0-based focused step index. */
  stepIndex: number
  totalSteps: number
  /** Label of the step that would be entered by Prev (or null when at the start). */
  prevStepLabel: string | null
  /** Label of the step that would be entered by Next (or null when at the end). */
  nextStepLabel: string | null
  onPrev: () => void
  onNext: () => void
  onExit: () => void
  onAsk: (message: string) => void
}

function HighwayDockImpl({
  stepTopic,
  stepIndex,
  totalSteps,
  prevStepLabel,
  nextStepLabel,
  onPrev,
  onNext,
  onExit,
  onAsk,
}: HighwayDockProps) {
  const [draft, setDraft] = useState('')
  const isFirst = stepIndex === 0
  const isLast = stepIndex === totalSteps - 1

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const value = draft.trim()
      if (value.length === 0) return
      onAsk(value)
      setDraft('')
    },
    [draft, onAsk],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      // Submit on Enter without shift so arrow-key nav stays unambiguous.
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        const value = draft.trim()
        if (value.length === 0) return
        onAsk(value)
        setDraft('')
      }
    },
    [draft, onAsk],
  )

  const nextButtonLabel = isLast
    ? 'Done · Back to plan →'
    : `Done · Step ${stepIndex + 2}${nextStepLabel ? ` · ${nextStepLabel}` : ''} →`
  const handleNext = isLast ? onExit : onNext

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-5 pointer-events-none">
      <form
        onSubmit={handleSubmit}
        className="pointer-events-auto flex w-full max-w-[720px] items-center gap-2 rounded-2xl border border-brand-50 bg-warm-white pl-1.5 pr-1.5 py-1.5 shadow-[var(--shadow-toolbar)]"
      >
        <button
          type="button"
          onClick={onPrev}
          disabled={isFirst}
          className="font-body inline-flex h-10 items-center gap-1 rounded-xl px-3 text-sm text-brand-500 hover:bg-brand-25 hover:text-leather focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={prevStepLabel ? `Previous step: ${prevStepLabel}` : 'Previous step'}
          title={prevStepLabel ?? 'Previous step'}
        >
          <span aria-hidden>←</span>
          <span>Step {isFirst ? 1 : stepIndex}</span>
        </button>
        <span aria-hidden className="h-5 w-px bg-brand-100" />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask a question about ${stepTopic}…`}
          className="font-body min-w-0 flex-1 bg-transparent px-2 text-sm text-leather placeholder:text-brand-400 focus:outline-none"
          aria-label={`Ask about ${stepTopic}`}
        />
        <button
          type="button"
          onClick={handleNext}
          className="font-heading inline-flex h-10 items-center rounded-xl bg-leather px-4 text-sm text-paper hover:bg-leather/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
        >
          {nextButtonLabel}
        </button>
      </form>
    </div>
  )
}

export const HighwayDock = memo(HighwayDockImpl)
