// Diagram accent + background palette, lifted from
// image-generator/app/lib/diagramPools.ts (2026-04-25, DD.A).
//
// DP1.6 ships a single fixed variant per project rather than the 3-variation
// orchestration of the source. The pickDiagramVariant() helper here returns
// one DiagramVariationSeed deterministically — default is dark+blue, which
// matches the prototype's brand-leaning Visualize Value treatment.

export const DIAGRAM_ACCENT_COLORS = [
  { id: 'blue', name: 'Blue', hex: '#308DED', usage: 'Cloud, networking, data flow' },
  { id: 'green', name: 'Green', hex: '#12CCA6', usage: 'Success, security, validation' },
  { id: 'orange', name: 'Orange', hex: '#FA8A45', usage: 'Energy, action, deployment' },
]

export const DIAGRAM_BACKGROUNDS = {
  dark: '#1B1918',
  light: '#FFFFFF',
}

/**
 * Pick a single diagram variant for DP1.6.
 *
 * @param {Object} [opts]
 * @param {'blue' | 'green' | 'orange'} [opts.accentId] — defaults to 'blue'
 * @param {'dark' | 'light'} [opts.background] — defaults to 'dark'
 * @returns {{ accentColor: { id: string, name: string, hex: string, usage: string }, background: 'dark' | 'light' }}
 */
export function pickDiagramVariant(opts = {}) {
  const accentId = opts.accentId ?? 'blue'
  const background = opts.background ?? 'dark'
  const accentColor =
    DIAGRAM_ACCENT_COLORS.find((c) => c.id === accentId) ?? DIAGRAM_ACCENT_COLORS[0]
  return { accentColor, background }
}
