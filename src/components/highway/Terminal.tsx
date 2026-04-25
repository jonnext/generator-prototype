// Terminal — dark code block, Inter Medium mono-ish rendering.
//
// Reference: Paper artboard 2X8-0 node 2Y7-0. Dark leather background,
// warm-white text, copy-and-run chip top-right. Renders with Inter Medium
// at 13px / 20px line-height per the canvas computed style (not a true
// mono, because FK + Inter are the shipping pair and Inter Medium renders
// surprisingly well at display weight).
//
// copy-and-run chip is a stub for now — clicking it copies the code to
// clipboard and shows a transient "Copied" confirmation. Execution is
// explicitly not wired (and probably never will be in the prototype —
// students execute in their own terminal).

import { memo, useCallback, useState } from 'react'

export interface TerminalProps {
  /** Language tag from the fenced code block, e.g. 'bash', 'python'. */
  language: string
  /** Raw code contents — preserve whitespace. */
  code: string
}

function TerminalImpl({ language, code }: TerminalProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard write can fail in non-secure contexts; fail quietly.
    }
  }, [code])

  return (
    <div
      className="rounded-xl px-5 py-4"
      style={{ background: 'var(--leather)', color: '#f5f1ea' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span
          className="type-label-s"
          style={{ color: 'var(--accent-clay)' }}
        >
          {language === 'text' ? 'TERMINAL' : language.toUpperCase()}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="type-label-s text-brand-200 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/30 rounded-full px-2 py-0.5"
        >
          {copied ? 'copied' : 'copy and run'}
        </button>
      </div>
      <pre className="overflow-x-auto">
        <code
          className="font-body text-[13px] leading-[20px]"
          style={{ whiteSpace: 'pre' }}
        >
          {code}
        </code>
      </pre>
    </div>
  )
}

export const Terminal = memo(TerminalImpl)
