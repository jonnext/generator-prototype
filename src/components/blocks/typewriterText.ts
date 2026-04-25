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
