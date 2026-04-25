// ArchitectureDiagram — DP1.6.E.
//
// Phase D's canvas slot. Renders one of three states:
//
//   1. Shimmer  (status === 'generating')
//      A multi-state wait UX driven by elapsed time. Built on BfM principles
//      from /Users/jonneylon/Documents/obsidian-vault/2 - 🗒️ Fleeting Notes/
//      Built for mars - UX cheatsheets.md:
//
//        - Variability       — headline + sub-copy evolves through 4 phases.
//        - Building a moment — agent-as-teammate voice ("Sketching…").
//        - Labour illusion   — wireframe boxes animate in one-by-one in the
//                              same brand-blue accent the final image uses,
//                              so the wait previews the arriving aesthetic.
//        - Personalisation   — sub-copy threads in the student's actual
//                              project title + step headings, never generic.
//        - Set expectations  — subtle "Usually about 20 seconds" line.
//        - Don't trap        — the slot lives above content blocks that are
//                              streaming concurrently, so attention can drift.
//
//   2. Ready    (status === 'ready' && diagramUrl)
//      <motion.img> that crossfades in over the shimmer (AnimatePresence).
//
//   3. Hidden   (status === 'idle' | 'failed' | undefined)
//      Component renders nothing. Graceful degradation — no error UI in the
//      canvas, the rest of the flow continues unaffected.

import { AnimatePresence, motion } from 'motion/react'
import { memo, useEffect, useState } from 'react'
import type { DiagramStatus } from '@/lib/state'

const SHARED_ELEMENT_EASE = [0.16, 1, 0.3, 1] as const

// ---------------------------------------------------------------------------
// Shimmer state machine
// ---------------------------------------------------------------------------
//
// Elapsed-time-driven (no progress signal from Gemini available). Each entry
// declares a window in seconds; the renderer picks the latest window whose
// `from` is ≤ elapsed.

interface ShimmerStage {
  from: number
  headline: string
  /** Builds sub-copy from the active plan's title + step headings. */
  subCopy: (ctx: ShimmerContext) => string
}

interface ShimmerContext {
  title: string
  stepHeadings: string[]
  /** Tick value that increments every 2s in stage 2 to rotate sub-copy. */
  rotation: number
}

const SHIMMER_STAGES: ShimmerStage[] = [
  {
    from: 0,
    headline: 'Sketching the architecture',
    subCopy: (ctx) => `Reading ${truncate(ctx.title, 60)}…`,
  },
  {
    from: 4,
    headline: 'Drawing the components',
    subCopy: (ctx) => buildPairCopy(ctx),
  },
  {
    from: 12,
    headline: 'Refining the details',
    subCopy: () => 'Adding labels and connections…',
  },
  {
    from: 20,
    headline: 'Almost there',
    subCopy: () => 'Final touches…',
  },
]

function pickStage(elapsedSec: number): ShimmerStage {
  let active = SHIMMER_STAGES[0]
  for (const stage of SHIMMER_STAGES) {
    if (stage.from <= elapsedSec) active = stage
  }
  return active
}

/**
 * Build "↳ Connecting {step[i]} to {step[i+1]}…" with rotation through pairs.
 * Falls back to a single-step phrasing when only one heading is available, or
 * a generic "Mapping the flow…" when there are none.
 */
function buildPairCopy(ctx: ShimmerContext): string {
  const headings = ctx.stepHeadings.filter((h) => h.trim().length > 0)
  if (headings.length === 0) return 'Mapping the flow…'
  if (headings.length === 1) return `Sketching ${truncate(headings[0], 50)}…`

  const pairs: Array<[string, string]> = []
  for (let i = 0; i < headings.length - 1; i++) {
    pairs.push([headings[i], headings[i + 1]])
  }
  const [a, b] = pairs[ctx.rotation % pairs.length]
  return `↳ Connecting ${truncate(a, 30)} to ${truncate(b, 30)}…`
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…'
}

// ---------------------------------------------------------------------------
// Wireframe boxes — labour illusion visual
// ---------------------------------------------------------------------------
//
// Four boxes connected by arrows, in the same brand-blue accent the final
// Gemini image uses. CSS-only — no SVG drawing animation, no canvas. Each
// box fades + scales in via Motion at staggered intervals (0.4s, 1.2s, 2.0s,
// 2.8s into Stage 1) and then sits there until the real image lands.
//
// The arrows are simple horizontal lines with a thin chevron. They draw in
// after the boxes via clip-path width animation.

const BOX_DELAYS_S = [0.4, 1.2, 2.0, 2.8] as const
const ARROW_DELAYS_S = [3.6, 4.4, 5.2] as const

interface WireframeProps {
  /** Mounted ms ago — used to derive whether arrows have appeared yet. */
  elapsedSec: number
}

function Wireframe({ elapsedSec: _elapsedSec }: WireframeProps) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center px-12"
      aria-hidden
    >
      <div className="flex w-full max-w-[560px] items-center justify-between">
        {BOX_DELAYS_S.map((delay, i) => (
          <span key={i} className="flex items-center">
            <motion.span
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay,
                duration: 0.45,
                ease: SHARED_ELEMENT_EASE,
              }}
              className="block h-14 w-20 rounded-md border border-[1.5px] border-[#308DED]/70"
            />
            {i < BOX_DELAYS_S.length - 1 ? (
              <motion.span
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{
                  delay: ARROW_DELAYS_S[i],
                  duration: 0.5,
                  ease: SHARED_ELEMENT_EASE,
                }}
                style={{ transformOrigin: 'left center' }}
                className="mx-1 h-px w-10 bg-[#308DED]/60 md:w-16"
              />
            ) : null}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ArchitectureDiagramProps {
  status: DiagramStatus | undefined
  diagramUrl: string | undefined
  /** Used by the shimmer copy to personalise to the active project. */
  title: string
  /** Used by the shimmer copy to thread step headings into the wait. */
  stepHeadings: string[]
}

function ArchitectureDiagramImpl({
  status,
  diagramUrl,
  title,
  stepHeadings,
}: ArchitectureDiagramProps) {
  const isGenerating = status === 'generating'
  const isReady = status === 'ready' && Boolean(diagramUrl)

  // Shimmer-only state — the elapsed-time tick. Mounted only when generating
  // so we don't burn renders when the diagram is hidden / ready / failed.
  return (
    <AnimatePresence mode="wait" initial={false}>
      {isReady ? (
        <motion.figure
          key="diagram-ready"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: SHARED_ELEMENT_EASE }}
          className="overflow-hidden rounded-2xl border border-brand-50 bg-warm-white shadow-[var(--shadow-card)]"
        >
          <img
            src={diagramUrl}
            alt={`Architecture diagram for ${title}`}
            className="block h-auto w-full"
            loading="lazy"
          />
        </motion.figure>
      ) : isGenerating ? (
        <ShimmerFrame
          key="diagram-shimmer"
          title={title}
          stepHeadings={stepHeadings}
        />
      ) : null}
    </AnimatePresence>
  )
}

interface ShimmerFrameProps {
  title: string
  stepHeadings: string[]
}

function ShimmerFrame({ title, stepHeadings }: ShimmerFrameProps) {
  const [elapsedSec, setElapsedSec] = useState(0)

  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000))
    }, 500)
    return () => clearInterval(interval)
  }, [])

  // Rotation tick: bumps every 2s while in stage 2 (4s ≤ elapsed < 12s).
  // Outside that window the rotation freezes — the headline copy carries
  // the change, no reason to keep cycling sub-copy.
  const rotation = Math.floor(Math.max(0, Math.min(elapsedSec, 11) - 4) / 2)

  const stage = pickStage(elapsedSec)
  const subCopy = stage.subCopy({ title, stepHeadings, rotation })

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: SHARED_ELEMENT_EASE }}
      className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-dashed border-brand-100 bg-[#1B1918]"
      role="status"
      aria-live="polite"
      aria-label={`${stage.headline}. ${subCopy}`}
    >
      {/* Wireframe boxes — labour illusion visual previewing the final image */}
      <Wireframe elapsedSec={elapsedSec} />

      {/* Top-left agent indicator — same dot family as ResearchPulse */}
      <div className="absolute left-4 top-4 flex items-center gap-2">
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-[#308DED] opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#308DED]" />
        </span>
        <span className="font-heading text-xs uppercase tracking-[0.12em] text-white/60">
          Phase D
        </span>
      </div>

      {/* Bottom copy stack — headline + sub-copy + expectation hint */}
      <div className="absolute bottom-4 left-4 right-4 space-y-1.5">
        <AnimatePresence mode="wait">
          <motion.p
            key={stage.headline}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3, ease: SHARED_ELEMENT_EASE }}
            className="font-heading text-sm text-white md:text-base"
          >
            {stage.headline}
          </motion.p>
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.p
            key={subCopy}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3, ease: SHARED_ELEMENT_EASE }}
            className="type-label-s text-white/70"
          >
            {subCopy}
          </motion.p>
        </AnimatePresence>
        <p className="type-label-s text-white/40">Usually about 20 seconds</p>
      </div>
    </motion.div>
  )
}

export const ArchitectureDiagram = memo(ArchitectureDiagramImpl)
