// CodeBlock — DP1.5.G; typewriter mode added in DP1.7.E.
//
// Renders a code snippet with an optional filename label. No syntax
// highlighting in DP1.5.G — the bundle already carries highlight.js via
// ResearchCard's markdown renderer, but wiring it here adds complexity for
// a visual-polish feature that can land post-DP1.5. Monospace + subtle
// background is enough for the student to read + copy commands.
//
// whitespace-pre-wrap preserves newlines and indentation from the LLM's
// code string. `overflow-x-auto` + `whitespace-pre` would look cleaner for
// long lines but hides wrapping — prefer wrapping at the cost of ragged
// right edges for now.
//
// Typewriter mode types the code string at 50ms/char (slower than prose
// at 30ms) so the deliberate, ratcheting feel reads as code-being-written
// rather than text-being-skimmed.

import { memo, useState } from 'react'
import type { CodeBlock as CodeBlockType } from '@/lib/state'
import { Typewriter } from '@/components/Typewriter'

const CODE_TYPE_SPEED_MS = 50

export interface CodeBlockViewProps {
  block: CodeBlockType
  typewriter?: { onComplete: () => void }
}

function CodeBlockViewImpl({ block, typewriter }: CodeBlockViewProps) {
  const [typed, setTyped] = useState(false)

  return (
    <figure className="flex flex-col gap-1">
      {block.filename ? (
        <figcaption className="type-label-s text-brand-400">
          {block.filename}
        </figcaption>
      ) : null}
      <pre className="overflow-x-auto rounded-md border border-brand-50 bg-leather/[0.03] p-3 text-xs leading-relaxed text-leather md:text-sm">
        <code className="font-mono whitespace-pre-wrap">
          {typewriter && !typed ? (
            <Typewriter
              as="span"
              text={block.code}
              speedMs={CODE_TYPE_SPEED_MS}
              onComplete={() => {
                setTyped(true)
                typewriter.onComplete()
              }}
            />
          ) : (
            block.code
          )}
        </code>
      </pre>
    </figure>
  )
}

export const CodeBlockView = memo(CodeBlockViewImpl)
