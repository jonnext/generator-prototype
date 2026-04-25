// ResearchCardContent — the heavy "compare options" comparison table body.
//
// This module is the lazy target. ResearchCard.tsx imports it via React.lazy
// so the option-comparison data (pros / cons / bestFor for 3 options across
// 7 decision types) isn't loaded until a student actually taps "compare
// options →" on some step. Per bundle-dynamic-imports this keeps the
// Discovery screen and the sculpting entrance under bundle budget.
//
// Krishna's critique note: compare OPTIONS, not SOURCES. This replaces the
// old "Perplexity said X / Firecrawl said Y" model with head-to-head pros
// and cons the student can make a decision from.

import { memo } from 'react'
import { researchComparisons } from '@/lib/copy'

export interface ResearchCardContentProps {
  decisionType: string
  /** When set, highlight this option as the one the student picked. */
  currentSelection: string | null
}

function ResearchCardContentImpl({
  decisionType,
  currentSelection,
}: ResearchCardContentProps) {
  const comparison = researchComparisons[decisionType]

  if (!comparison) {
    // RP1: researchComparisons is now a FALLBACK for 12 known slugs (AWS,
    // container, API). For Claude-generated slugs (cooking, music, anything
    // project-specific) we don't have authored pros/cons. Show the friendly
    // placeholder instead. RP2 will fill this with lazy research synthesis.
    return (
      <p className="font-body text-xs text-brand-400">
        Detailed comparison coming soon — for now, the rationale above explains the AI's pick.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-body text-xs font-semibold text-leather">
        {comparison.question}
      </p>
      <div className="flex flex-col gap-3">
        {comparison.options.map((option) => {
          const isCurrent = option.name === currentSelection
          return (
            <article
              key={option.name}
              className={
                isCurrent
                  ? 'rounded-xl border border-brand-200 bg-brand-25 p-3'
                  : 'rounded-xl border border-brand-50 bg-warm-white p-3'
              }
            >
              <header className="flex items-center justify-between">
                <h4 className="font-heading text-sm text-leather">
                  {option.name}
                </h4>
                {isCurrent ? (
                  <span className="font-body rounded-full bg-leather px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-paper">
                    Current
                  </span>
                ) : null}
              </header>
              <p className="font-body mt-1 text-xs text-brand-500">
                {option.bestFor}
              </p>
              <dl className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <dt className="font-body text-[10px] uppercase tracking-[0.1em] text-success">
                    Pros
                  </dt>
                  <ul className="mt-1 flex flex-col gap-1">
                    {option.pros.map((pro) => (
                      <li
                        key={pro}
                        className="font-body text-xs leading-relaxed text-leather"
                      >
                        + {pro}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <dt className="font-body text-[10px] uppercase tracking-[0.1em] text-warning">
                    Cons
                  </dt>
                  <ul className="mt-1 flex flex-col gap-1">
                    {option.cons.map((con) => (
                      <li
                        key={con}
                        className="font-body text-xs leading-relaxed text-leather"
                      >
                        − {con}
                      </li>
                    ))}
                  </ul>
                </div>
              </dl>
            </article>
          )
        })}
      </div>
    </div>
  )
}

// Default export so React.lazy can pick it up with the expected shape.
// Memoized so a parent step card re-render doesn't rebuild the table.
const ResearchCardContent = memo(ResearchCardContentImpl)
export default ResearchCardContent
