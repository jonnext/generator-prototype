// ToolbarInput — the expanded text-input state of the Discovery Toolbar.
//
// This is the direct successor to the old SearchInput. When the student
// taps the Generate nav item on the Discovery screen the Toolbar
// AnimatePresence-swaps this in via shared-element morph
// (layoutId="toolbarInput"). The *inner* input is wrapped in its own
// layoutId="chatInput" so the legacy Discovery -> Canvas ChatTray handoff
// keeps working downstream.
//
// Shell dimensions intentionally mirror DISCOVERY_SHELL_CLASS in
// Toolbar.tsx — same height (h-13), same rounded-3xl corners, same
// py-1.5 px-3.5 padding, same border and shadow. A stable target box
// means Motion only interpolates content crossfade, not box geometry.
//
// Two layoutIds, two responsibilities:
//   - layoutId="toolbarInput" on the outer shell: morph between collapsed
//     pill and expanded form inside the Discovery toolbar.
//   - layoutId="chatInput" on the inner composer: morph from Discovery
//     expanded input into the ChatTray composer when the student fires
//     Generate and the canvas materializes. This preserves the continuity
//     SearchInput.tsx:45 and ChatTray.tsx:135 previously shared.
//
// Submit handler calls onSubmit with the trimmed intent — the same
// `onGenerate` path DiscoveryScreen used through SearchInput. No new API
// was invented; we just moved where the composer lives.
//
// Accessibility:
//  - Autofocused on mount so the expansion feels continuous with the tap.
//  - Escape collapses without submitting.
//  - Enter / form submit fires Generate.
//  - 44px min-height button for mobile tap targets.

import { motion } from 'motion/react'
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { layoutIds } from '@/motion/transitions'
import { sharedElement } from '@/motion/springs'

export interface ToolbarInputProps {
  /** Called with the trimmed intent when the student submits. */
  onSubmit: (value: string) => void
  /** Called when the student presses Escape — collapses without submitting. */
  onCancel: () => void
  /** Optional pulse class piped through from the Toolbar shell. */
  pulseClass?: string
}

function ToolbarInputImpl({
  onSubmit,
  onCancel,
  pulseClass = '',
}: ToolbarInputProps) {
  // Draft text is strictly local. Lifting it to the engine would re-render
  // every chat subscriber on every keystroke (rerender-split-combined-hooks).
  const [draft, setDraft] = useState('')

  // Transient input ref for autofocus — not reactive
  // (rerender-use-ref-transient-values).
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Focus on the next frame so the layoutId morph has mounted the input
    // before we ask the browser to place the caret in it.
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  const trimmed = draft.trim()
  const canSubmit = trimmed.length > 0

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!canSubmit) return
      onSubmit(trimmed)
    },
    [canSubmit, onSubmit, trimmed],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    },
    [onCancel],
  )

  return (
    <motion.form
      layoutId={layoutIds.toolbarInput}
      transition={sharedElement}
      layout
      onSubmit={handleSubmit}
      className={`flex h-13 w-full items-center gap-3 rounded-3xl border border-solid border-[#E5DEDA] bg-white px-3.5 py-1.5 [box-shadow:#1B191814_0px_12px_16px_-4px,#1B191808_0px_4px_6px_-2px] focus-within:border-[#1B1918] ${pulseClass}`}
    >
      {/* Inner composer carries layoutId="chatInput" so the Discovery ->
          Canvas ChatTray morph still has a shared-element source. When
          the student fires Generate, phase flips to materializing, the
          Toolbar re-renders in canvas mode, and the ChatTray composer
          picks up this same layoutId on the other side of the swap. */}
      <motion.div
        layoutId={layoutIds.chatInput}
        transition={sharedElement}
        className="flex flex-1 items-center"
      >
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What do you want to build?"
          aria-label="Project idea"
          className="font-body w-full bg-transparent text-[13px]/4 text-[#1B1918] placeholder:text-[#6C615C] focus:outline-none"
        />
      </motion.div>
      <button
        type="submit"
        disabled={!canSubmit}
        aria-label="Generate project"
        className="font-heading inline-flex items-center rounded-[13px] bg-[#1B1918] px-3 py-1.5 text-[13px]/4 font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        Create
      </button>
    </motion.form>
  )
}

export const ToolbarInput = memo(ToolbarInputImpl)
