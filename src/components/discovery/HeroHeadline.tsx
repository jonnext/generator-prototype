// HeroHeadline — editorial serif headline that anchors the Discovery page.
//
// Copy from Paper frame `31R-0` "Explore Starting Point". We use the
// existing `--font-display` token (Iowan Old Style → Georgia fallback)
// rather than literal Suisse Neue — that fallback was deliberately
// chosen on 2026-04-15 (see tokens.css L32-39).
//
// 2026-04-25 (round 3): drops centring + shrinks the upper bound of the
// clamp now that the headline lives in a 50% column on Discovery rather
// than spanning the page. The smaller cap keeps the line breaking
// gracefully without forcing an awkward two-line wrap.

export interface HeroHeadlineProps {
  className?: string
}

export function HeroHeadline({ className }: HeroHeadlineProps) {
  return (
    <h1
      className={
        'text-center font-display font-medium text-leather' +
        (className ? ` ${className}` : '')
      }
      style={{
        fontSize: 'clamp(48px, 8vw, 96px)',
        lineHeight: '1.04',
        letterSpacing: '-0.03em',
      }}
    >
      What will you learn next?
    </h1>
  )
}
