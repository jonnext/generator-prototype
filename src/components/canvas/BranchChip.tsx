// BranchChip — DP1.5.J.
//
// Surfaces a research-driven suggestion that the current step might benefit
// from taking a different direction. Rendered at the top of a StepCard
// when the research store flags a finding as `significance: 'branch-
// candidate'` (the orchestrator's branch-candidate heuristic fires on
// findings whose snippets match "use X instead of Y", "migrated to",
// "deprecated", etc.).
//
// Agent-as-teammate voice per the plan's Strategic Framing — phrased as a
// colleague's observation ("Most tutorials now…"), not as an error banner
// or a command. Two actions: Switch (apply the branch — re-fires section
// generator for this step with the alternative in context) and Dismiss
// (just marks the finding surfaced so it stops promoting; the research
// itself stays in the store for the section generator's next pass).

import { motion } from 'motion/react'
import { memo } from 'react'
import type { ResearchFinding } from '@/lib/state'

export interface BranchChipProps {
  finding: ResearchFinding
  stepId: string
  onApply: (finding: ResearchFinding, stepId: string) => void
  onDismiss: (findingId: string) => void
}

function BranchChipImpl({
  finding,
  stepId,
  onApply,
  onDismiss,
}: BranchChipProps) {
  const summary = extractBranchSummary(finding)

  return (
    <motion.aside
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50/40 px-3 py-2.5"
      role="note"
      aria-label="Research-suggested alternative direction"
    >
      <span aria-hidden className="mt-0.5 text-sm">🔀</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-sm leading-snug text-leather">{summary}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onApply(finding, stepId)}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-brand-300 bg-warm-white px-3 type-label-s font-medium text-leather hover:border-brand-400 hover:bg-brand-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
          >
            <span>Switch this step</span>
            <span aria-hidden>→</span>
          </button>
          <button
            type="button"
            onClick={() => onDismiss(finding.id)}
            className="inline-flex h-7 items-center rounded-full px-2.5 type-label-s text-brand-400 hover:text-leather transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
            aria-label="Dismiss suggestion"
          >
            Dismiss
          </button>
        </div>
      </div>
    </motion.aside>
  )
}

export const BranchChip = memo(BranchChipImpl)

// ----------------------------------------------------------------------------
// extractBranchSummary — pulls a scannable sentence from the finding so the
// chip reads as editorial, not as a raw snippet dump. Tries three strategies
// in order:
//   1. Find the sentence containing branch-pattern language (instead of,
//      rather than, most tutorials, deprecated, etc.).
//   2. Fall back to the first sentence of the snippet.
//   3. Fall back to the snippet title.
// ----------------------------------------------------------------------------

const BRANCH_LIKE_RE =
  /[^.!?\n]*(?:use|uses|using|prefer|instead of|rather than|over|migrated?|replaced|deprecated|most\s+\w+|in 2026|now\b)[^.!?\n]*[.!?]/i

export function extractBranchSummary(finding: ResearchFinding): string {
  const snippet = finding.snippets[0]
  if (!snippet) return 'Research suggests an alternative approach.'

  const content = snippet.content.trim()
  if (content.length === 0) {
    return snippet.title || 'Research suggests an alternative approach.'
  }

  const match = content.match(BRANCH_LIKE_RE)
  if (match) {
    return truncate(match[0].trim(), 220)
  }

  const firstSentence = content.split(/(?<=[.!?])\s+/)[0] ?? content
  return truncate(firstSentence, 220)
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max).trimEnd() + '…'
}
