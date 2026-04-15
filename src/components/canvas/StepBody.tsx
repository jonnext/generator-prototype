// StepBody — react-markdown renderer for Step 2+ production-format bodies.
//
// The production outline prompt (projects-app/backend/projects/ai/prompts/
// _agent-outline.prompt) emits a specific internal structure for every step:
//
//   **Basket**: 2-3 sentence bridge from the previous step
//   **Objective**: one sentence on what the learner will accomplish
//   **Key Actions**: numbered list of concrete substeps (with code blocks)
//   **Launchpad**: 1-2 sentence bridge to the next step
//
// Thread 1 (inpainting.ts) now generates this exact structure. This component
// renders it with visual fidelity to the production UI: section labels from
// bold runs, code blocks with language chips, blockquotes as Callout variants,
// and typography that matches the prototype's font/colour tokens.
//
// -------------------- CRITICAL: rerender-no-inline-components --------------
//
// react-markdown re-renders on every markdown chunk during streaming. If any
// component override inside the `components={...}` prop is defined inline
// (inline function or arrow), React creates a new component type on every
// render, destroying and recreating the entire DOM subtree on every chunk.
//
// Therefore EVERY override below is a module-level `function` declaration,
// and MARKDOWN_COMPONENTS / REMARK_PLUGINS / REHYPE_PLUGINS are all
// module-level `const` references with stable identity.
// --------------------------------------------------------------------------

import { memo, type ReactNode, type ReactElement } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { PluggableList } from 'unified'

// ----------------------------------------------------------------------------
// Element overrides — every one is a module-level function declaration.
// ----------------------------------------------------------------------------

function MarkdownParagraph({ children }: { children?: ReactNode }) {
  return <p className="font-body text-sm leading-relaxed text-leather my-3">{children}</p>
}

function MarkdownStrong({ children }: { children?: ReactNode }) {
  return <strong className="font-semibold text-leather">{children}</strong>
}

function MarkdownEm({ children }: { children?: ReactNode }) {
  return <em className="italic">{children}</em>
}

// Inline code — rehype-highlight only wraps block code in <pre>, so standalone
// <code> elements are always inline. When a <code> appears INSIDE a <pre>,
// rehype-highlight attaches a `language-*` className. We detect that here and
// render plainly so the MarkdownPre wrapper can apply the full block styling.
//
// `node` (a hast AST node) is passed by react-markdown as an extra prop; we
// destructure and discard it so it doesn't spread onto the DOM and trigger
// React's "unknown DOM attribute" dev warning.
type InlineCodeProps = {
  children?: ReactNode
  className?: string
  node?: unknown
} & Record<string, unknown>

function MarkdownInlineCode({ children, className, node, ...props }: InlineCodeProps) {
  void node // discard hast node — don't spread onto DOM
  const isBlock = typeof className === 'string' && className.includes('language-')
  if (isBlock) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  }
  return (
    <code className="rounded bg-brand-50/60 px-1 py-0.5 font-mono text-[13px] text-leather">
      {children}
    </code>
  )
}

function MarkdownPre({
  children,
  node,
  ...props
}: {
  children?: ReactNode
  node?: unknown
}) {
  void node // discard hast node — don't spread onto DOM
  // `children` is usually a single <code> element carrying the language-*
  // className from rehype-highlight, but react-markdown occasionally passes
  // an array (e.g. when text nodes sit alongside the <code>). Harden the
  // extraction so language detection still works in the array case.
  const firstChild = Array.isArray(children) ? children[0] : children
  const codeElement = firstChild as ReactElement<{ className?: string }> | undefined
  const language = codeElement?.props?.className?.match(/language-(\w+)/)?.[1]

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-brand-50 bg-warm-white">
      {language ? (
        <div className="flex items-center justify-between border-b border-brand-50 bg-brand-50/40 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-brand-400">
          <span>{language}</span>
        </div>
      ) : null}
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed" {...props}>
        {children}
      </pre>
    </div>
  )
}

function MarkdownOl({ children }: { children?: ReactNode }) {
  return <ol className="my-3 list-decimal space-y-2 pl-5 marker:text-brand-400">{children}</ol>
}

function MarkdownUl({ children }: { children?: ReactNode }) {
  return <ul className="my-3 list-disc space-y-2 pl-5 marker:text-brand-400">{children}</ul>
}

function MarkdownLi({ children }: { children?: ReactNode }) {
  return <li className="font-body text-sm leading-relaxed text-leather">{children}</li>
}

function MarkdownH2({ children }: { children?: ReactNode }) {
  return <h2 className="typography-h2">{children}</h2>
}

function MarkdownH3({ children }: { children?: ReactNode }) {
  return <h3 className="typography-h3">{children}</h3>
}

function MarkdownH4({ children }: { children?: ReactNode }) {
  return <h4 className="typography-h4">{children}</h4>
}

function MarkdownHr() {
  return <hr className="my-5 border-brand-50" />
}

function MarkdownA({ children, href }: { children?: ReactNode; href?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand-400 underline underline-offset-2 transition-colors hover:text-leather focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
    >
      {children}
    </a>
  )
}

// ----------------------------------------------------------------------------
// Callout — blockquote override that sniffs for a leading **Tip:** / **Note:**
// / **Warning:** / **Important:** bold label and picks a visual variant.
// ----------------------------------------------------------------------------

type CalloutVariant = 'tip' | 'note' | 'warning' | 'important' | 'neutral'

const CALLOUT_VARIANT_CLASSES: Record<CalloutVariant, string> = {
  tip: 'border-brand-300 bg-brand-50/50',
  note: 'border-brand-300 bg-brand-50/50',
  warning: 'border-amber-400 bg-amber-50/70',
  important: 'border-amber-400 bg-amber-50/70',
  neutral: 'border-brand-100 bg-warm-white',
}

function extractLeadingText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) {
    return node.map(extractLeadingText).join('')
  }
  if (node && typeof node === 'object' && 'props' in node) {
    const el = node as ReactElement<{ children?: ReactNode }>
    return extractLeadingText(el.props.children)
  }
  return ''
}

function detectCalloutVariant(children: ReactNode): CalloutVariant {
  try {
    const text = extractLeadingText(children).toLowerCase()
    if (text.startsWith('tip:') || text.startsWith('tip ')) return 'tip'
    if (text.startsWith('note:') || text.startsWith('note ')) return 'note'
    if (text.startsWith('warning:') || text.startsWith('warning ')) return 'warning'
    if (text.startsWith('important:') || text.startsWith('important ')) return 'important'
  } catch {
    /* fall through to neutral */
  }
  return 'neutral'
}

function Callout({ children }: { children?: ReactNode }) {
  const variant = detectCalloutVariant(children)
  const classes = CALLOUT_VARIANT_CLASSES[variant]
  return (
    <aside
      role="note"
      aria-label={variant}
      className={`my-4 rounded-r-xl border-l-4 py-3 px-4 ${classes}`}
    >
      {children}
    </aside>
  )
}

// ----------------------------------------------------------------------------
// Module-level stable references — the whole point of this file's structure.
// ----------------------------------------------------------------------------

const MARKDOWN_COMPONENTS: Components = {
  p: MarkdownParagraph,
  strong: MarkdownStrong,
  em: MarkdownEm,
  code: MarkdownInlineCode as Components['code'],
  pre: MarkdownPre,
  ol: MarkdownOl,
  ul: MarkdownUl,
  li: MarkdownLi,
  h2: MarkdownH2,
  h3: MarkdownH3,
  h4: MarkdownH4,
  hr: MarkdownHr,
  a: MarkdownA,
  blockquote: Callout,
}

const REMARK_PLUGINS: PluggableList = [remarkGfm]
const REHYPE_PLUGINS: PluggableList = [[rehypeHighlight, { ignoreMissing: true }]]

// ----------------------------------------------------------------------------

export interface StepBodyProps {
  markdown: string
  isInpainting: boolean
}

function StepBodyImpl({ markdown, isInpainting }: StepBodyProps) {
  return (
    <section
      aria-label="Step instructions"
      className={`flex flex-col ${isInpainting ? 'text-brand-400' : 'text-leather'}`}
    >
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={MARKDOWN_COMPONENTS}
      >
        {markdown}
      </ReactMarkdown>
    </section>
  )
}

export const StepBody = memo(StepBodyImpl)
