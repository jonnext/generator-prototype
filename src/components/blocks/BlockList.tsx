// BlockList — DP1.5.G; first-reveal typewriter cascade added in DP1.7.E.
//
// Maps an array of ContentBlock entries to their matching renderer
// component. Single source of truth for the block-type → component
// mapping; StepCard and nested callouts both call this.
//
// The discriminated union on block.type gives TypeScript exhaustive
// checking at the BlockRenderer switch — adding a 6th block type later
// will surface a compile error here until the case is added.
//
// Two render paths after DP1.7.E:
//   1. First reveal — the very first time this BlockList instance receives
//      a non-empty blocks array, blocks type in via the Typewriter primitive
//      one at a time in document order. The instance ref `hasFirstRevealed`
//      flips after that first reveal so subsequent renders skip the cascade.
//   2. Sculpt refresh — every subsequent blocks change (sculpt regenerated
//      a new array on a step that was already 'ready') uses the static
//      render path. The crossfade animation that wraps BlockList lives at
//      StepCard, not here, so we just emit the static blocks.
//
// Callouts re-enter BlockList recursively via their `blocks` field. They
// pass `mode='typewriter'` explicitly so the inner BlockList stays in the
// cascade even though its own ref is fresh — keeps the typewriter feel
// consistent through nested content.

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { ContentBlock } from '@/lib/state'
import { ParagraphBlockView } from './ParagraphBlock'
import { HeadingBlockView } from './HeadingBlock'
import { ListBlockView } from './ListBlock'
import { CodeBlockView } from './CodeBlock'
import { CalloutBlockView } from './CalloutBlock'

export type BlockListMode = 'typewriter' | 'crossfade'

export interface BlockListProps {
  blocks: ContentBlock[]
  /**
   * DP1.7.E — explicit override for the cascade mode. CalloutBlock passes
   * 'typewriter' when its parent is mid-cascade so nested content keeps
   * the same feel. Omitted at top level — BlockList's mode state decides.
   */
  mode?: BlockListMode
  /**
   * DP1.7.E — fires once when every block in the typewriter cascade has
   * finished typing. DP1.7.F's Continue CTA hooks here so it appears the
   * moment the last block lands. No-op for the static/crossfade path.
   */
  onAllBlocksComplete?: () => void
}

function BlockListImpl({ blocks, mode, onAllBlocksComplete }: BlockListProps) {
  // The cascade decision is held in state, not a render-time-derived ref.
  // Why: we need it to flip ONLY when the cascade completes — never as a
  // side-effect of an unrelated parent re-render. Phase D's diagram-ready
  // dispatch (and Pass 2's setStepBlocks) re-render this list mid-cascade;
  // a ref-derived isFirstReveal would silently switch the conditional from
  // <TypewriterCascade> to the static <div>, unmounting the cascade and
  // snapping all text in at once. The state-flip below only happens when
  // the cascade fires its onAllBlocksComplete.
  const [cascadeMode, setCascadeMode] = useState<BlockListMode | null>(null)

  useEffect(() => {
    if (cascadeMode !== null) return
    if (blocks.length === 0) return
    setCascadeMode('typewriter')
  }, [cascadeMode, blocks.length])

  const handleCascadeComplete = useCallback(() => {
    setCascadeMode('crossfade')
    onAllBlocksComplete?.()
  }, [onAllBlocksComplete])

  const effectiveMode: BlockListMode = mode ?? cascadeMode ?? 'typewriter'

  if (blocks.length === 0) return null

  if (effectiveMode === 'typewriter') {
    return <TypewriterCascade blocks={blocks} onAllBlocksComplete={handleCascadeComplete} />
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </div>
  )
}

export const BlockList = memo(BlockListImpl)

// ----------------------------------------------------------------------------
// TypewriterCascade — drives the per-block sequence on first reveal.
// Block at activeIndex is currently typing; blocks before it are static
// (post-completion swap to marked content); blocks after it don't render
// yet. When activeIndex passes blocks.length-1, fires onAllBlocksComplete
// once for the parent (StepCard / DP1.7.F's Continue CTA wiring).
// ----------------------------------------------------------------------------

interface TypewriterCascadeProps {
  blocks: ContentBlock[]
  onAllBlocksComplete?: () => void
}

function TypewriterCascade({ blocks, onAllBlocksComplete }: TypewriterCascadeProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const completedRef = useRef(false)

  const handleBlockComplete = useCallback(() => {
    setActiveIndex((current) => current + 1)
  }, [])

  // Keep the parent callback ref stable so the cascade-complete effect
  // doesn't re-fire when StepCard creates a new closure each render.
  const onAllBlocksCompleteRef = useRef(onAllBlocksComplete)
  useEffect(() => {
    onAllBlocksCompleteRef.current = onAllBlocksComplete
  }, [onAllBlocksComplete])

  useEffect(() => {
    if (activeIndex >= blocks.length && !completedRef.current) {
      completedRef.current = true
      onAllBlocksCompleteRef.current?.()
    }
  }, [activeIndex, blocks.length])

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => {
        if (i > activeIndex) return null
        const isActive = i === activeIndex
        return (
          <BlockRenderer
            key={block.id}
            block={block}
            typewriter={isActive ? { onComplete: handleBlockComplete } : undefined}
          />
        )
      })}
    </div>
  )
}

// ----------------------------------------------------------------------------
// BlockRenderer — discriminated-union switch shared by both render paths.
// `typewriter` is opt-in per block; when omitted the block renders statically
// (the post-cascade default). The switch's exhaustiveness checks all five
// block types compile-time.
// ----------------------------------------------------------------------------

interface BlockRendererProps {
  block: ContentBlock
  typewriter?: { onComplete: () => void }
}

function BlockRenderer({ block, typewriter }: BlockRendererProps) {
  switch (block.type) {
    case 'paragraph':
      return <ParagraphBlockView block={block} typewriter={typewriter} />
    case 'heading':
      return <HeadingBlockView block={block} typewriter={typewriter} />
    case 'list':
      return <ListBlockView block={block} typewriter={typewriter} />
    case 'code':
      return <CodeBlockView block={block} typewriter={typewriter} />
    case 'callout':
      return <CalloutBlockView block={block} typewriter={typewriter} />
  }
}
