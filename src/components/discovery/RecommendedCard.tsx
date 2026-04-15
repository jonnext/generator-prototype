// RecommendedCard — single gradient card in the SearchCard's bottom row.
//
// Frame fidelity: the Paper source uses OKLab color stops which Tailwind
// v4 doesn't express via arbitrary value, so we carry the gradient as an
// inline style `backgroundImage`. sRGB approximations of the three OKLab
// gradients are defined in SearchCard.tsx and passed in as `gradient`.
//
// Per rerender-no-inline-components, RecommendedCard is module-level. It
// takes a pre-built gradient string so the parent can declare the three
// gradient CSS values at module scope too (stable identity, no per-render
// object churn).
//
// OKLab source values from Paper frame `HV-0` for future fidelity tuning:
//
//   Beginner:  oklab(54.1% -0.069 0.035)  →  oklab(33.4% -0.052 0.023)
//   AI/ML:     oklab(52.2%  0.041 0.064)  →  oklab(32.8%  0.031 0.045)
//   PRO:       oklab(45.9%  0.042 -0.092) →  oklab(27.3%  0.032 -0.074)
//
// Rendered as <article aria-label="…"> so each card is a landmark the
// screen reader can navigate via rotor.

export interface RecommendedCardProps {
  title: string
  /** Full `linear-gradient(...)` CSS value. Passed as inline backgroundImage. */
  gradient: string
  /** Optional override; defaults to `${title} — Recommended starting point`. */
  ariaLabel?: string
}

export function RecommendedCard({
  title,
  gradient,
  ariaLabel,
}: RecommendedCardProps) {
  return (
    <article
      aria-label={ariaLabel ?? `${title} pathway — Recommended starting point`}
      className="flex h-25 shrink grow basis-0 items-end rounded-[10px] p-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1918]/40"
      style={{ backgroundImage: gradient }}
    >
      <span className="text-[13px]/4 font-semibold text-white">{title}</span>
    </article>
  )
}
