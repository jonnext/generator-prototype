// Shown on the Discovery screen when the student's query doesn't match any
// community project. Rather than stranding them with a dead grid, this
// surfaces a Generate CTA (Maya's refinement from the April 10 critique):
// "We couldn't find that. Generate a new project -> "
//
// The component is intentionally simple — no motion, no deep structure. Its
// only job is to push the student from search mode into generate mode.

import { memo } from 'react'

export interface EmptySearchPromptProps {
  query: string
  onGenerate: (query: string) => void
  isGenerating?: boolean
}

function EmptySearchPromptImpl({
  query,
  onGenerate,
  isGenerating = false,
}: EmptySearchPromptProps) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-brand-100 bg-warm-white/60 p-6">
      <div className="space-y-1">
        <p className="font-heading text-base text-leather">
          Nothing in the community yet for that idea.
        </p>
        <p className="font-body text-sm text-brand-500">
          Generate it from scratch and we will build the outline together.
        </p>
      </div>

      <button
        type="button"
        onClick={() => onGenerate(query)}
        disabled={isGenerating || query.trim().length === 0}
        className="font-heading inline-flex items-center gap-2 rounded-xl bg-leather px-4 py-2 text-sm text-paper disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isGenerating ? 'Generating…' : 'Generate this instead'}
        <span aria-hidden>{'\u2192'}</span>
      </button>
    </div>
  )
}

export const EmptySearchPrompt = memo(EmptySearchPromptImpl)
