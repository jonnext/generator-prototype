// LearnSearchInput — magnifying-glass icon + "I want to learn…" text input.
//
// The Paper frame draws this as a placeholder text row; we promote it to a
// real controlled <input> so Jon's typing submits to the generator. The
// input is a leaf, so its local state lives inside SearchCard — this
// component is a pure render of whatever value/onChange/onSubmit it
// receives (rerender-derived-state-no-effect).
//
// Accessibility:
//   - Visually-hidden <label> for screen readers (sr-only).
//   - id + aria-describedby hook into a hint in SearchCard's filter row.
//   - Submits on Enter when value is non-empty. No click-to-submit affordance
//     because the frame has none; Enter is the only path.
//
// Module-level per rerender-no-inline-components.

import { useCallback, type KeyboardEvent } from 'react'

export interface LearnSearchInputProps {
  value: string
  onChange: (next: string) => void
  onSubmit: (value: string) => void
  /** id the visually-hidden label and input share. */
  inputId: string
  /** id of a helper element (e.g. filter-pill row) for aria-describedby. */
  describedById?: string
}

export function LearnSearchInput({
  value,
  onChange,
  onSubmit,
  inputId,
  describedById,
}: LearnSearchInputProps) {
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
    <div className="flex items-center gap-2.5 border-b border-solid border-b-[#E5DEDA] pb-3 transition-colors focus-within:border-b-[#1B1918]">
      {/* Magnifying-glass SVG — lifted verbatim from Paper frame HV-0. */}
      <svg
        aria-hidden="true"
        width="22"
        height="22"
        viewBox="0 0 22 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <circle
          cx="11"
          cy="11"
          r="7"
          stroke="#9E8F88"
          strokeWidth="1.5"
        />
        <line
          x1="16"
          y1="16"
          x2="20"
          y2="20"
          stroke="#9E8F88"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>

      <label htmlFor={inputId} className="sr-only">
        What do you want to learn?
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="I want to learn…"
        aria-describedby={describedById}
        className="flex-1 bg-transparent text-[15px]/4.5 text-[#1B1918] placeholder:text-[#9E8F88] focus:outline-none focus-visible:outline-none"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  )
}
