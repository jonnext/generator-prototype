// ListBlock — DP1.5.G; typewriter mode added in DP1.7.E.
//
// Renders the three list variants the prototype ports from production:
//   ordered    → <ol> with numbered markers
//   unordered  → <ul> with bullet markers (bullet instructions per step)
//   task       → custom list with a checkbox-style prefix (student tasks)
//
// Task lists match the "In this step, get ready to:" pattern from
// NEXTWORK_STEP_STANDARDS — they're the checklist of outcomes the
// student will complete. The checkboxes here are visual only (not
// interactive); DP3's living-doc feature will wire actual state.
//
// Typewriter mode types items in document order: item 1 reveals via the
// Typewriter primitive, fires onComplete which advances the active item
// index, item 2 starts, and so on. When the last item completes, the
// outer block-level onComplete fires so BlockList advances to the next
// block. Items past the active index render their bullet/marker but
// hold their text invisible (visibility:hidden) so the column reserves
// height and prevents layout reflow as items reveal. Items before the
// active index render the full marked TextSpans (post-typewriter swap).

import { memo, useCallback, useState } from 'react'
import type { ListBlock as ListBlockType, ListItem } from '@/lib/state'
import { TextSpans } from './TextSpanRenderer'
import { Typewriter } from '@/components/Typewriter'
import { flattenSpansToText } from './typewriterText'

export interface ListBlockViewProps {
  block: ListBlockType
  typewriter?: { onComplete: () => void }
}

function ListBlockViewImpl({ block, typewriter }: ListBlockViewProps) {
  if (block.listType === 'task') {
    return <TaskList items={block.items} typewriter={typewriter} />
  }
  if (block.listType === 'ordered') {
    return <OrderedList items={block.items} typewriter={typewriter} />
  }
  return <UnorderedList items={block.items} typewriter={typewriter} />
}

export const ListBlockView = memo(ListBlockViewImpl)

// ----------------------------------------------------------------------------
// Per-item cascade controller. Each list variant uses this to walk through
// items[] one at a time during typewriter mode. activeIndex is the item that
// is currently typing. < activeIndex → fully rendered. > activeIndex → marker
// visible, content reserved with visibility:hidden so layout doesn't shift.
// ----------------------------------------------------------------------------

function useItemCascade(itemCount: number, typewriter?: { onComplete: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0)

  const handleItemComplete = useCallback(() => {
    setActiveIndex((current) => {
      const next = current + 1
      if (next >= itemCount) {
        typewriter?.onComplete()
      }
      return next
    })
  }, [itemCount, typewriter])

  return { activeIndex, handleItemComplete }
}

interface ItemContentProps {
  item: ListItem
  isActive: boolean
  isPast: boolean
  onComplete: () => void
}

function ItemContent({ item, isActive, isPast, onComplete }: ItemContentProps) {
  if (isPast) {
    return <TextSpans spans={item.content} />
  }
  if (isActive) {
    return (
      <Typewriter
        as="span"
        text={flattenSpansToText(item.content)}
        onComplete={onComplete}
      />
    )
  }
  // Future item: keep TextSpans rendered but invisible so the row reserves
  // its final height. Using visibility:hidden (not display:none) preserves
  // layout; the bullet/number marker still shows on the active row.
  return (
    <span style={{ visibility: 'hidden' }}>
      <TextSpans spans={item.content} />
    </span>
  )
}

function TaskList({
  items,
  typewriter,
}: {
  items: ListItem[]
  typewriter?: { onComplete: () => void }
}) {
  const { activeIndex, handleItemComplete } = useItemCascade(items.length, typewriter)

  return (
    <ul className="flex flex-col gap-2 text-sm leading-relaxed text-leather md:text-base">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span
            aria-hidden
            className="mt-[0.3rem] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-brand-200 bg-warm-white"
          />
          <span className="min-w-0 flex-1">
            {typewriter ? (
              <ItemContent
                item={item}
                isActive={i === activeIndex}
                isPast={i < activeIndex}
                onComplete={handleItemComplete}
              />
            ) : (
              <TextSpans spans={item.content} />
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

function UnorderedList({
  items,
  typewriter,
}: {
  items: ListItem[]
  typewriter?: { onComplete: () => void }
}) {
  const { activeIndex, handleItemComplete } = useItemCascade(items.length, typewriter)

  return (
    <ul className="flex flex-col gap-1.5 text-sm leading-relaxed text-leather md:text-base">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span
            aria-hidden
            className="mt-[0.55em] inline-block h-1 w-1 shrink-0 rounded-full bg-brand-400"
          />
          <span className="min-w-0 flex-1">
            {typewriter ? (
              <ItemContent
                item={item}
                isActive={i === activeIndex}
                isPast={i < activeIndex}
                onComplete={handleItemComplete}
              />
            ) : (
              <TextSpans spans={item.content} />
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

function OrderedList({
  items,
  typewriter,
}: {
  items: ListItem[]
  typewriter?: { onComplete: () => void }
}) {
  const { activeIndex, handleItemComplete } = useItemCascade(items.length, typewriter)

  return (
    <ol className="flex flex-col gap-1.5 text-sm leading-relaxed text-leather md:text-base">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span
            aria-hidden
            className="mt-0 type-label-s shrink-0 tabular-nums text-brand-400"
          >
            {i + 1}.
          </span>
          <span className="min-w-0 flex-1">
            {typewriter ? (
              <ItemContent
                item={item}
                isActive={i === activeIndex}
                isPast={i < activeIndex}
                onComplete={handleItemComplete}
              />
            ) : (
              <TextSpans spans={item.content} />
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}
