// SpotifyRow — generic horizontal-scroll row with a section header.
//
// Pattern lifted from Spotify's home screen: a strong title, optional
// subtitle, optional "Show all" affordance, and a track of cards that
// the user drags / wheels / arrow-keys through. Native `overflow-x-auto`
// + `scroll-snap-type: x mandatory` (declared in src/index.css under
// .spotify-row-track) keeps the scroll feel native and accessible.
//
// 2026-04-27: added a `tone` prop so the same row can render against
// either the paper background (light, dark title) or the dark "browse
// panel" (dark bg, light title). Subtitles and Show-all stay muted in
// both tones — brand-400 reads on both leather and paper.

import type { CSSProperties, ReactNode } from 'react'

export type SpotifyRowTone = 'paper' | 'dark'

export interface SpotifyRowProps {
  title: string
  subtitle?: string
  /** Renders a "Show all" link in the header when provided. */
  onShowAll?: () => void
  /** Background context — drives the title text color. */
  tone?: SpotifyRowTone
  /** Layout mode for the cards inside.
   *   1 (default) → single horizontal row, fixed-width cards, overflow-x scroll
   *   2/3        → auto-fit wrap grid, cards stretch to fill cells, NO
   *                horizontal scroll. The eye reads multiple rows at once
   *                instead of scrubbing — feels like a "library shelf." */
  rows?: 1 | 2 | 3
  children: ReactNode
}

// One inline style for both header and track keeps the title and the cards
// in perfect lateral alignment regardless of which Tailwind breakpoint
// applies — clamp() guarantees the value lands without depending on JIT
// class generation.
const SIDE_PADDING: CSSProperties = {
  paddingInline: 'clamp(2.5rem, 5vw, 5rem)',
}

export function SpotifyRow({
  title,
  subtitle,
  onShowAll,
  tone = 'paper',
  rows = 1,
  children,
}: SpotifyRowProps) {
  const titleColor = tone === 'dark' ? 'text-paper' : 'text-leather'
  const isStack = rows >= 2

  return (
    <section className="flex w-full flex-col gap-3">
      {/* Header — title + subtitle on the left, optional Show all right. */}
      <header
        className="flex items-end justify-between gap-4"
        style={SIDE_PADDING}
      >
        <div className="flex flex-col gap-0.5">
          <h2
            className={`font-display text-[26px]/[1.1] font-medium tracking-[-0.01em] ${titleColor}`}
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="text-[13px]/[1.4] text-brand-400">{subtitle}</p>
          ) : null}
        </div>
        {onShowAll ? (
          <button
            type="button"
            onClick={onShowAll}
            className="type-label-s cursor-pointer text-brand-400 hover:text-leather"
          >
            Show all
          </button>
        ) : null}
      </header>

      {/* Track — single row scrolls horizontally with snap; multi-row mode
          becomes a flow grid that wraps cards to fill the panel width. */}
      {isStack ? (
        <div className="w-full pb-2" style={SIDE_PADDING}>
          <div
            className="grid w-full gap-3"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            }}
          >
            {children}
          </div>
        </div>
      ) : (
        <div className="spotify-row-track w-full overflow-x-auto">
          <div className="flex gap-3 pb-2" style={SIDE_PADDING}>
            {children}
          </div>
        </div>
      )}
    </section>
  )
}
