// Unified search + generate input used on the Discovery screen.
//
// Shape of AI Suggestions pattern: one input, three jobs:
//   1. Filter the Community Projects grid as the student types
//   2. Act as the Generate submit when they press enter
//   3. Morph via Motion shared-element transition into the docked ChatTray
//      input when the student moves to the Canvas screen
//
// The layoutId on the outer wrapper is what Motion interpolates across the
// screen change, so both this input and the ChatTray input must reference
// the same layoutIds.chatInput constant.

import { motion } from 'motion/react'
import { memo, type FormEvent } from 'react'
import { layoutIds } from '@/motion/transitions'
import { sharedElement } from '@/motion/springs'

export interface SearchInputProps {
  value: string
  onChange: (next: string) => void
  onSubmit: (value: string) => void
  placeholder?: string
  /** When true, the submit button shows a pending state (Generate in progress). */
  isSubmitting?: boolean
}

function SearchInputImpl({
  value,
  onChange,
  onSubmit,
  placeholder = 'What do you want to build?',
  isSubmitting = false,
}: SearchInputProps) {
  const trimmed = value.trim()
  const canSubmit = trimmed.length > 0 && !isSubmitting

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit(trimmed)
  }

  return (
    <motion.form
      layoutId={layoutIds.chatInput}
      transition={sharedElement}
      onSubmit={handleSubmit}
      className="flex w-full items-center gap-2 rounded-2xl border border-brand-50 bg-warm-white px-4 py-3 shadow-[var(--shadow-card)] focus-within:border-brand-200"
    >
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Project idea"
        autoFocus
        className="font-body flex-1 bg-transparent text-base text-leather placeholder:text-brand-300 focus:outline-none"
      />
      <button
        type="submit"
        disabled={!canSubmit}
        className="font-heading rounded-xl bg-leather px-4 py-2 text-sm text-paper transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSubmitting ? 'Generating…' : 'Generate'}
      </button>
    </motion.form>
  )
}

// Memoize so parent re-renders (e.g. deferredQuery flip) don't re-render the input.
export const SearchInput = memo(SearchInputImpl)
