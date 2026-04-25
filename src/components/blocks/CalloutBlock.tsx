// CalloutBlock — DP1.5.G; typewriter mode added in DP1.7.E.
//
// Titled callout with nested content blocks. Variants tint the border and
// background subtly — NextWork's editorial voice means no loud icons, no
// full-color fills. The tint is enough to signal "this is a side note"
// without the cheap chat-bubble affect.
//
// Recursive: CalloutBlock.blocks is ContentBlock[], so we import BlockList
// and render nested blocks through it. Because the type union is finite,
// recursion terminates at leaves (paragraph, heading, list, code — or
// another callout, which also terminates).
//
// In typewriter mode, the variant tag (TIP, WARNING, etc.) renders
// immediately — it's structural, not content. The inner blocks then
// typewriter via BlockList in 'typewriter' mode. When the inner cascade
// completes, the outer onComplete fires so the parent BlockList moves on.

import { memo } from 'react'
import type {
  CalloutBlock as CalloutBlockType,
  CalloutVariant,
} from '@/lib/state'
import { BlockList } from './BlockList'

export interface CalloutBlockViewProps {
  block: CalloutBlockType
  typewriter?: { onComplete: () => void }
}

function CalloutBlockViewImpl({ block, typewriter }: CalloutBlockViewProps) {
  const classes = variantClasses(block.variant)

  return (
    <aside
      className={`flex flex-col gap-2 rounded-lg border px-4 py-3 ${classes}`}
      role="note"
    >
      <header className="type-label-s font-medium uppercase tracking-wide">
        {block.title}
      </header>
      <div className="flex flex-col gap-2">
        <BlockList
          blocks={block.blocks}
          mode={typewriter ? 'typewriter' : undefined}
          onAllBlocksComplete={typewriter?.onComplete}
        />
      </div>
    </aside>
  )
}

export const CalloutBlockView = memo(CalloutBlockViewImpl)

// ----------------------------------------------------------------------------
// Variant → Tailwind class map. Keeping all variants in one table so adding
// a new variant (e.g. for DP3) is a one-entry change.
// ----------------------------------------------------------------------------

function variantClasses(variant: CalloutVariant): string {
  switch (variant) {
    case 'tip':
      return 'border-brand-100 bg-brand-50/40 text-leather'
    case 'info':
      return 'border-brand-100 bg-brand-50/25 text-leather'
    case 'troubleshooting':
      return 'border-amber-200 bg-amber-50/40 text-leather'
    case 'announcement':
      return 'border-brand-200 bg-brand-50/50 text-leather'
    case 'costWarning':
      return 'border-amber-200 bg-amber-50/30 text-leather'
    case 'error':
      return 'border-red-200 bg-red-50/40 text-leather'
  }
}
