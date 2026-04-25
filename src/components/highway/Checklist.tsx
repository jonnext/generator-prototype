// Checklist — "WHAT YOU'LL DO" radio-circle task list, one item per line.
//
// Visual pattern lifted from Paper artboard 2X8-0 (node 2XV-0). Each item
// has an empty circle on the left (currently decorative — Chunk D+ can wire
// a checked state per-step as the student completes them), with the task
// text in Inter 17px.
//
// Label is optional so the component can also render a pill-decision list
// later without changing the structure.

import { memo } from 'react'

export interface ChecklistProps {
  label?: string
  items: string[]
}

function ChecklistImpl({ label = "What you'll do", items }: ChecklistProps) {
  if (items.length === 0) return null
  return (
    <section className="flex flex-col gap-4">
      <h2 className="type-label-s text-brand-400">{label}</h2>
      <ul className="flex flex-col gap-3">
        {items.map((item, index) => (
          <li
            key={`${index}-${item.slice(0, 16)}`}
            className="flex items-start gap-3"
          >
            <span
              aria-hidden
              className="mt-1 inline-block h-4 w-4 shrink-0 rounded-full border border-brand-300"
            />
            <span className="font-body text-[17px] leading-[26px] text-leather">
              {item}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export const Checklist = memo(ChecklistImpl)
