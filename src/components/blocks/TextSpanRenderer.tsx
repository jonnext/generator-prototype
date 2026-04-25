// TextSpanRenderer — DP1.5.G.
//
// Inline renderer for a run of text with optional marks (bold / italic /
// code / link). Used by every block type that has TextSpan[] content —
// paragraphs, headings, list items. Keeps the mark-to-element mapping in
// one place so block renderers stay thin.
//
// Links open in a new tab with rel="noopener noreferrer" because the
// content is AI-generated from web-sourced research — we can't vet the
// destinations, and rel protects against window.opener tab-hijacking.

import { memo } from 'react'
import type { TextSpan } from '@/lib/state'

export interface TextSpansProps {
  spans: TextSpan[]
}

function TextSpansImpl({ spans }: TextSpansProps) {
  return (
    <>
      {spans.map((span, i) => (
        <TextSpanNode key={i} span={span} />
      ))}
    </>
  )
}

export const TextSpans = memo(TextSpansImpl)

function TextSpanNode({ span }: { span: TextSpan }) {
  if (!span.marks || span.marks.length === 0) {
    return <>{span.text}</>
  }

  // Marks compose — bold + code + link all wrap the same text. Walk
  // outside-in so the link anchor is the outermost element (the tap target),
  // with code/bold/italic styling applied inside.
  let node: React.ReactNode = span.text

  for (const mark of span.marks) {
    switch (mark.type) {
      case 'bold':
        node = <strong className="font-medium text-leather">{node}</strong>
        break
      case 'italic':
        node = <em className="italic">{node}</em>
        break
      case 'code':
        node = (
          <code className="rounded bg-brand-50/80 px-1 py-px font-mono text-[0.9em] text-leather">
            {node}
          </code>
        )
        break
      case 'link':
        node = (
          <a
            href={mark.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-500 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-400 transition-colors"
          >
            {node}
          </a>
        )
        break
    }
  }

  return <>{node}</>
}
