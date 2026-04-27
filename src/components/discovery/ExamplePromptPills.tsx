// ExamplePromptPills — four arrow-prefixed pills under the hero headline.
//
// Each pill is a real <button> that, when clicked, autofills the Generate
// input above the bottom bar. It does NOT submit — Jon's spec on
// 2026-04-25 was "build upon what we currently have already, just nicer
// entry point". So clicking a pill is a content seeder, not a shortcut.
//
// Visual styling lifted from Paper frame `31R-0`: translucent white
// background, soft warm border, arrow + label inline. Pills wrap into a
// responsive grid (2 cols on wider viewports, stacking down to 1 on
// narrow screens).

import { EXAMPLE_PROMPTS, type ExamplePrompt } from '@/data/examplePrompts'

export interface ExamplePromptPillsProps {
  /** Called with the pill's text when the student clicks it. */
  onPick: (prompt: ExamplePrompt) => void
}

export function ExamplePromptPills({ onPick }: ExamplePromptPillsProps) {
  return (
    <div
      role="group"
      aria-label="Example projects"
      className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2"
    >
      {EXAMPLE_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onPick(prompt)}
          className="flex items-center gap-2 justify-self-start rounded-full border border-solid border-[#ECE7DA] bg-white/50 px-4.5 py-2.5 text-[14px]/[18px] text-leather transition-colors hover:bg-white hover:border-[#D9D2C5] focus:outline-none focus-visible:ring-2 focus-visible:ring-leather/30"
        >
          <span className="font-medium" aria-hidden="true">
            →
          </span>
          <span>{prompt}</span>
        </button>
      ))}
    </div>
  )
}
