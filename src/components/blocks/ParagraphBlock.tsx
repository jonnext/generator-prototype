// ParagraphBlock — DP1.5.G; typewriter mode added in DP1.7.E.
//
// Body prose for step content. Matches NextWork's editorial feel — relaxed
// leading, leather body color, body-size type. Keep styling minimal so
// nested paragraphs (inside CalloutBlock) inherit the callout's context
// color rather than fighting it.
//
// In typewriter mode (DP1.7.E first-reveal pass), the paragraph types its
// flat text via the Typewriter primitive and fires onComplete to advance
// the BlockList cascade. Inline marks (bold/italic/code/link) are dropped
// during the typing pass and restored once typing finishes — option 2a from
// the chunk plan. The flash on swap is minimal because mark styling doesn't
// change layout, only weight/color.

import { memo, useState } from 'react'
import type { ParagraphBlock as ParagraphBlockType } from '@/lib/state'
import { TextSpans } from './TextSpanRenderer'
import { Typewriter } from '@/components/Typewriter'
import { BLOCK_TYPEWRITER_SPEED_MS, flattenSpansToText } from './typewriterText'

export interface ParagraphBlockViewProps {
  block: ParagraphBlockType
  typewriter?: { onComplete: () => void }
}

function ParagraphBlockViewImpl({ block, typewriter }: ParagraphBlockViewProps) {
  const [typed, setTyped] = useState(false)

  if (typewriter && !typed) {
    return (
      <p className="text-sm leading-relaxed text-leather md:text-base">
        <Typewriter
          as="span"
          text={flattenSpansToText(block.content)}
          speedMs={BLOCK_TYPEWRITER_SPEED_MS}
          onComplete={() => {
            setTyped(true)
            typewriter.onComplete()
          }}
        />
      </p>
    )
  }

  return (
    <p className="text-sm leading-relaxed text-leather md:text-base">
      <TextSpans spans={block.content} />
    </p>
  )
}

export const ParagraphBlockView = memo(ParagraphBlockViewImpl)
