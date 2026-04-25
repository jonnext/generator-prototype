// HeadingBlock — DP1.5.G; typewriter mode added in DP1.7.E.
//
// Substep heading INSIDE a step body. Only level 4 is allowed per
// NEXTWORK_STEP_STANDARDS; the section-generator validator rejects other
// levels. Rendered as <h4> with the heading font — bigger than body text,
// smaller than the step's top-level heading (which is still an <h3> on the
// StepCard heading row).
//
// In typewriter mode, the heading types its plain text and swaps to the
// marked TextSpans renderer on completion, mirroring ParagraphBlock.

import { memo, useState } from 'react'
import type { HeadingBlock as HeadingBlockType } from '@/lib/state'
import { TextSpans } from './TextSpanRenderer'
import { Typewriter } from '@/components/Typewriter'
import { flattenSpansToText } from './typewriterText'

export interface HeadingBlockViewProps {
  block: HeadingBlockType
  typewriter?: { onComplete: () => void }
}

function HeadingBlockViewImpl({ block, typewriter }: HeadingBlockViewProps) {
  const [typed, setTyped] = useState(false)

  if (typewriter && !typed) {
    return (
      <h4 className="font-heading text-base font-medium leading-tight text-leather md:text-lg mt-2">
        <Typewriter
          as="span"
          text={flattenSpansToText(block.content)}
          onComplete={() => {
            setTyped(true)
            typewriter.onComplete()
          }}
        />
      </h4>
    )
  }

  // Only level 4 is valid inside a step body. We still render defensively
  // if level drifts — map unexpected levels to h4 styling so the layout
  // doesn't break. The validator should have caught this upstream.
  return (
    <h4 className="font-heading text-base font-medium leading-tight text-leather md:text-lg mt-2">
      <TextSpans spans={block.content} />
    </h4>
  )
}

export const HeadingBlockView = memo(HeadingBlockViewImpl)
