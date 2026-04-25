// NextWork ContentBlock subset for DP1.5.
//
// Ported from production ~/Dev/Nextwork/projects-app/app/src/api/models/contentBlock.ts
// with the OpenAPI-generated FromJSON/ToJSON boilerplate stripped — the
// prototype receives blocks already-parsed from Claude via the section
// generator, so runtime serialisation helpers aren't needed.
//
// DP1.5.A ships the 5-type subset production's Step 1 relies on:
//   paragraph | heading | list | code | callout
//
// The other 9 production block types (quiz, tabGroup, videoEmbed, step,
// validation, validationBox, image, divider, secretMission) are deliberately
// out of scope for this iteration — see plan generator-v2-direction-
// parallel-sifakis.md. They can be added incrementally post-DP1.5.

// -----------------------------------------------------------------------------
// Inline marks and text spans
// -----------------------------------------------------------------------------

/**
 * InlineMark — inline formatting for a run of text inside a TextSpan.
 * Production has 7 mark types (bold, italic, code, link, concept, ask,
 * variable). The prototype ports the 4 essentials; concept/ask/variable can
 * land when the pill/research system needs them (post-DP1.5).
 */
export type InlineMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'code' }
  | { type: 'link'; href: string }

/**
 * TextSpan — a run of text with optional inline marks. Paragraphs, headings
 * and list items are arrays of TextSpans, so a single paragraph can mix
 * plain text with bold/italic/code/link runs.
 */
export interface TextSpan {
  text: string
  marks?: InlineMark[]
}

// -----------------------------------------------------------------------------
// List + callout enums
// -----------------------------------------------------------------------------

export type ListVariant = 'ordered' | 'unordered' | 'task'

export interface ListItem {
  content: TextSpan[]
}

/**
 * CalloutVariant — matches production's palette so a Claude-generated callout
 * with `variant: 'tip'` can be rendered with the same visual treatment as a
 * NextWork production callout.
 */
export type CalloutVariant =
  | 'info'
  | 'tip'
  | 'troubleshooting'
  | 'announcement'
  | 'costWarning'
  | 'error'

// -----------------------------------------------------------------------------
// The 5 block types for DP1.5
// -----------------------------------------------------------------------------

export interface ParagraphBlock {
  id: string
  type: 'paragraph'
  content: TextSpan[]
}

export interface HeadingBlock {
  id: string
  type: 'heading'
  /**
   * Heading depth inside a step's body. Production uses 2-4; the prototype
   * section prompt asks Claude for level-4 substep headings (the typical
   * "Install Docker" / "Create Your Project" pattern). Level 2/3 are reserved
   * for step-level titles the prototype already renders from Step.heading.
   */
  level: 2 | 3 | 4
  content: TextSpan[]
}

export interface ListBlock {
  id: string
  type: 'list'
  listType: ListVariant
  items: ListItem[]
}

export interface CodeBlock {
  id: string
  type: 'code'
  language: string
  code: string
  filename?: string
}

/**
 * CalloutBlock — a titled callout containing nested content blocks. This is
 * the only recursive block type in the DP1.5 subset, matching production's
 * `blocks: ContentBlock[]` child field. Keeps parity with how NextWork
 * production nests cost warnings and tips.
 */
export interface CalloutBlock {
  id: string
  type: 'callout'
  variant: CalloutVariant
  title: string
  blocks: ContentBlock[]
}

/**
 * ContentBlock — the discriminated union used throughout the prototype for
 * step body content. `Step.blocks` (added in state.ts) is an optional array
 * of these, populated by the section generator in Phase B (DP1.5.F onward)
 * and rendered by BlockList (DP1.5.G onward). While `blocks` is undefined,
 * StepCard renders a shimmer placeholder.
 */
export type ContentBlock =
  | ParagraphBlock
  | HeadingBlock
  | ListBlock
  | CodeBlock
  | CalloutBlock

// -----------------------------------------------------------------------------
// flattenBlocksToText — DP1.7.D
// -----------------------------------------------------------------------------
//
// Walk a ContentBlock[] and produce clean prose for use in LLM prompt context.
// NOT for rendering — only for embedding "what's already been generated" facts
// into downstream step prompts so step N receives steps 1..N-1's actual
// rendered content as ground truth (kills the hallucination cascade observed
// in production where steps 3+ drift from step 1's reality).
//
// Output shape per block:
//   - paragraph: text content of all spans, joined
//   - heading:   prefixed with "#### " (level-4 fixed by buildHeading validator)
//   - list:
//       - unordered/task → each item on its own line, prefixed with "- "
//       - ordered        → each item on its own line, prefixed with "1. ", "2. ", …
//   - code:      fenced with ``` and language tag
//   - callout:   prefixed with "[VARIANT] title" tag, recursively flattens inner
//                blocks, indented two spaces so it reads as a nested context
//
// Inline marks are stripped — bold/italic/code/link visual treatment carries no
// semantic ground truth for the next step's LLM. The text content does.

function flattenSpans(spans: TextSpan[]): string {
  return spans.map((s) => s.text).join('')
}

function flattenBlock(block: ContentBlock): string {
  switch (block.type) {
    case 'paragraph':
      return flattenSpans(block.content)
    case 'heading':
      return `#### ${flattenSpans(block.content)}`
    case 'list': {
      const lines = block.items.map((item, i) => {
        const text = flattenSpans(item.content)
        if (block.listType === 'ordered') return `${i + 1}. ${text}`
        return `- ${text}`
      })
      return lines.join('\n')
    }
    case 'code': {
      const fence = '```'
      const filenameLine = block.filename ? `\n// ${block.filename}` : ''
      return `${fence}${block.language}${filenameLine}\n${block.code}\n${fence}`
    }
    case 'callout': {
      const inner = block.blocks.map(flattenBlock).join('\n\n')
      const indented = inner
        .split('\n')
        .map((line) => (line.length > 0 ? `  ${line}` : line))
        .join('\n')
      return `[${block.variant.toUpperCase()}] ${block.title}\n${indented}`
    }
  }
}

export function flattenBlocksToText(blocks: ContentBlock[]): string {
  return blocks.map(flattenBlock).join('\n\n')
}
