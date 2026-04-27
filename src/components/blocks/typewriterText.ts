// typewriterText — DP1.7.E.
//
// Helpers that flatten a TextSpan[] (paragraph/heading/list-item content) to
// the plain string the Typewriter primitive types out. Inline marks
// (bold/italic/code/link) are dropped for the typing pass and restored when
// the block re-renders post-onComplete via TextSpans. See ParagraphBlock for
// the swap rationale.

import type { TextSpan } from '@/lib/state'

export function flattenSpansToText(spans: TextSpan[]): string {
  return spans.map((s) => s.text).join('')
}

// DP1.8.D.3 — block-content typewriter speed. Prose blocks (paragraph,
// heading, list, callout) use this faster rate so the post-shaping step
// content reads quickly, while the materializing-phase intro choreography
// (placeholder rows, project header, step heading cascade) keeps the
// Typewriter primitive's default 30ms/char for a more deliberate feel.
// Code blocks keep their own slower 50ms/char — see CodeBlock.tsx.
export const BLOCK_TYPEWRITER_SPEED_MS = 18
