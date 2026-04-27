// Typewriter — DP1.7.A primitive.
//
// Generic char-by-char text reveal. Used by ProjectHeader (DP1.7.B), step
// headings (DP1.7.C), and block content (DP1.7.E) to create the choreographed
// "AI is writing this in front of you" feel from the plan's Strategic Framing.
//
// Why pure setInterval + React.memo, no Motion: this is char-by-char text
// streaming, not spatial/visual motion. A spring/tween wouldn't add anything
// and would pull a bigger animation runtime into a primitive that will be
// rendered once per visible block. The cursor blink is a Tailwind built-in
// (animate-pulse) so the component stays self-contained — no global CSS edit.

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

export interface TypewriterProps {
  text: string
  speedMs?: number
  startDelay?: number
  onComplete?: () => void
  skipOnClick?: boolean
  className?: string
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4'
}

const DEFAULT_SPEED_MS = 45

function TypewriterImpl({
  text,
  speedMs = DEFAULT_SPEED_MS,
  startDelay = 0,
  onComplete,
  skipOnClick = false,
  className,
  as = 'span',
}: TypewriterProps) {
  const reducedMotion = usePrefersReducedMotion()
  const [index, setIndex] = useState<number>(reducedMotion ? text.length : 0)

  // Stable ref so the interval effect doesn't re-tear-down when the parent
  // re-creates an inline onComplete each render.
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  // Guard so onComplete fires exactly once per text value, not on every
  // render after we hit the end.
  const completedRef = useRef<boolean>(false)

  useEffect(() => {
    completedRef.current = false
    setIndex(reducedMotion ? text.length : 0)
  }, [text, reducedMotion])

  useEffect(() => {
    if (index >= text.length && !completedRef.current) {
      completedRef.current = true
      onCompleteRef.current?.()
    }
  }, [index, text.length])

  useEffect(() => {
    // Accessibility: skip the animation entirely when the user prefers
    // reduced motion. Full text + onComplete already handled by the state
    // initialiser and the completion effect above.
    if (reducedMotion) return
    if (index >= text.length) return

    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | undefined

    const start = () => {
      if (cancelled) return
      intervalId = setInterval(() => {
        setIndex((current) => {
          if (current >= text.length) {
            if (intervalId !== undefined) clearInterval(intervalId)
            return current
          }
          return current + 1
        })
      }, speedMs)
    }

    if (index === 0 && startDelay > 0) {
      const timeoutId = setTimeout(start, startDelay)
      return () => {
        cancelled = true
        clearTimeout(timeoutId)
        if (intervalId !== undefined) clearInterval(intervalId)
      }
    }

    start()
    return () => {
      cancelled = true
      if (intervalId !== undefined) clearInterval(intervalId)
    }
  }, [text, speedMs, startDelay, reducedMotion, index])

  const handleClick = useCallback(() => {
    if (!skipOnClick) return
    setIndex(text.length)
  }, [skipOnClick, text.length])

  const visible = text.slice(0, index)
  const isTyping = index < text.length
  const Tag = as

  return (
    <Tag
      className={className}
      onClick={skipOnClick ? handleClick : undefined}
      style={skipOnClick ? { cursor: 'pointer' } : undefined}
    >
      {visible}
      {isTyping ? (
        <span
          aria-hidden
          className="ml-0.5 inline-block w-[1ch] motion-safe:animate-pulse text-brand-400"
        >
          ▍
        </span>
      ) : null}
    </Tag>
  )
}

export const Typewriter = memo(TypewriterImpl)
