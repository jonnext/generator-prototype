// GenerateProjectInput — the floating bottom prompt bar on Discovery.
//
// Replaces the previous LearnSearchInput inside SearchCard. Now a top-level
// component owned by DiscoveryScreen so example pills can autofill its
// value via a lifted state setter (Jon's spec on 2026-04-25: clicking a
// pill populates this input but does NOT submit; the student presses
// Generate Project / ⌘↵ to fire).
//
// Visual: matches Paper frame `31R-0` "Explore Starting Point". The
// Generate button uses `<Dithering>` from @paper-design/shaders-react
// with parameters lifted verbatim from the canvas JSX export so the
// motion of the button matches what Jon designed on Paper.
//
// Positioning: `fixed bottom-17 left-1/2 -translate-x-1/2` mirrors where
// the old SearchCard docked — above the persistent Toolbar (h-13 at
// bottom-1) with a 16px gap, matching the prototype's existing rhythm.

import { useCallback, useId, type KeyboardEvent } from 'react'
import { Dithering } from '@paper-design/shaders-react'

export interface GenerateProjectInputProps {
  value: string
  onChange: (next: string) => void
  onSubmit: (value: string) => void
  /** Optional: focus the input on mount. */
  autoFocus?: boolean
}

export function GenerateProjectInput({
  value,
  onChange,
  onSubmit,
  autoFocus,
}: GenerateProjectInputProps) {
  const reactId = useId()
  const inputId = `generate-input-${reactId}`

  const trySubmit = useCallback(() => {
    const trimmed = value.trim()
    if (trimmed.length === 0) return
    onSubmit(trimmed)
  }, [onSubmit, value])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return
      const trimmed = value.trim()
      if (trimmed.length === 0) return
      event.preventDefault()
      onSubmit(trimmed)
    },
    [onSubmit, value],
  )

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-17 z-30 flex justify-center px-4">
      <div
        className="pointer-events-auto flex w-[min(637px,100%)] items-center gap-2 rounded-[28px] border-[0.5px] border-solid border-[#E5DEDA] bg-white py-1 pl-5 pr-2"
        style={{
          boxShadow: '0px 2px 33px rgba(0, 0, 0, 0.18)',
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Describe what you want to build
        </label>
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe a project you want to build…"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          className="min-h-11.75 flex-1 bg-transparent text-[14px]/[18px] text-leather placeholder:text-[#A6A6A6] focus:outline-none focus-visible:outline-none"
        />

        {/* Attachment icon — purely decorative for now (no upload). The
            paperclip mark mirrors Paper frame `31R-0` so the affordance is
            preserved visually for a later iteration. */}
        <button
          type="button"
          aria-label="Attach a file (coming soon)"
          tabIndex={-1}
          className="flex shrink-0 items-center justify-center rounded-full p-2 text-[#72726E] transition-colors hover:bg-brand-25/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-leather/30"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M5.75 10.75V15.25C5.75 18.564 8.436 21.25 11.75 21.25H12.25C15.564 21.25 18.25 18.564 18.25 15.25V7C18.25 4.653 16.347 2.75 14 2.75C11.653 2.75 9.75 4.653 9.75 7V14.875C9.75 16.049 10.701 17 11.875 17C13.049 17 14 16.049 14 14.875V7.75"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          type="button"
          onClick={trySubmit}
          disabled={value.trim().length === 0}
          aria-label="Generate Project"
          className="relative flex h-10.25 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-[10px] bg-[#301C2A] px-5 text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-leather/30"
        >
          {/* Dithering shader values lifted from Paper canvas JSX export. */}
          <Dithering
            speed={1}
            shape="warp"
            type="4x4"
            size={2.5}
            scale={0.15}
            colorBack="#00000000"
            colorFront="#727272"
            className="pointer-events-none absolute inset-0"
          />
          <span className="relative font-heading text-[13px]/4 font-medium">
            Generate Project
          </span>
          <span className="relative text-[11px]/3.5 text-white/80">⌘↵</span>
        </button>
      </div>
    </div>
  )
}
