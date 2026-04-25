// Visualize Value diagram prompt builder, lifted from
// image-generator/app/lib/diagramRemixer.ts (2026-04-25, DD.A).
//
// DP1.6 strips the 3-variation orchestrator and the optional Claude Haiku
// remixer down to a single deterministic prompt. The system prompt and
// buildFullPrompt body are preserved verbatim from the source — only the
// orchestration around them is dropped.

import { DIAGRAM_BACKGROUNDS, pickDiagramVariant } from './pools.js'

// ============================================
// System prompt — Visualize Value aesthetic
// ============================================

export const DIAGRAM_SYSTEM_PROMPT = `You design architecture diagrams for technical learning content.

## Priority: Clarity
- Simple left-to-right flow where possible
- Every box and arrow is clearly labeled
- Understandable in a few seconds without reading context
- If it needs a paragraph to explain, it's too complex

## Match the Project
- Show components the learner will actually touch (API, DB, CLI, etc.)
- Use recognizable icons for major services (AWS, databases, etc.)
- Flow should match the actual build steps

## Visual Style — Visualize Value Aesthetic
- Ultra-thin lines only (1-2px stroke weight), no thick or chunky elements
- Wireframe/outline style: shapes are outlines only, never filled
- Delicate arrows: thin lines with small simple arrowheads
- Maximum negative space, minimalist composition
- Background: dark (#1B1918) or white
- ONE accent color for primary path: #308DED (blue), #12CCA6 (green), or #FA8A45 (orange)

## Simplicity Rules
- No spaghetti arrows pointing everywhere
- No enterprise-level detail
- Maximum 6-8 boxes for a standard diagram
- Every element earns its place

## Never
Gradients, shadows, 3D effects, decorative elements, mystery shapes without labels, thick strokes, fat arrows, filled shapes, chunky icons`

// ============================================
// Concept → full image-generation prompt
// ============================================

/**
 * Build a single image-generation prompt from a project concept.
 * The Gemini image model receives the system prompt as part of this string
 * (Gemini's image generation API doesn't support a separate system role) so
 * the style guidance is concatenated with the concept.
 *
 * @param {Object} concept
 * @param {string} concept.title — project title
 * @param {string} [concept.description] — short project description
 * @param {string[]} [concept.components] — derived from step headings
 * @param {Object} [opts]
 * @param {'blue' | 'green' | 'orange'} [opts.accentId]
 * @param {'dark' | 'light'} [opts.background]
 * @returns {string}
 */
export function buildDiagramPrompt(concept, opts = {}) {
  const variant = pickDiagramVariant(opts)
  const componentList =
    Array.isArray(concept.components) && concept.components.length > 0
      ? concept.components.join(', ')
      : 'infer from concept'

  const conceptSummary = concept.description
    ? `${concept.title} — ${concept.description}`
    : concept.title

  const sceneDescription = `Architecture diagram for: ${conceptSummary}.

Key components to show: ${componentList}.

Requirements:
- Left-to-right flow showing how data/requests move
- Label every box and connection
- Use service icons where recognizable (AWS, DB symbols, etc.)
- One accent color for the primary path`

  return buildFullPrompt(sceneDescription, variant)
}

/**
 * Wrap a scene description with the full Visualize Value style directive.
 * Verbatim port of buildFullPrompt() in image-generator/diagramRemixer.ts:159-164.
 */
function buildFullPrompt(description, variant) {
  const bgDesc = variant.background === 'dark' ? 'dark #1B1918' : 'white #FFFFFF'

  return `${DIAGRAM_SYSTEM_PROMPT}

---

Technical architecture diagram on ${bgDesc} background. ${description}

Use ${variant.accentColor.hex} as the single accent color for the primary flow path. Visualize Value style: ultra-thin 1-2px lines only, wireframe outlines (no fills), delicate arrows with small arrowheads, maximum negative space. No thick strokes, no fat arrows, no gradients, no shadows.`
}

// Re-export so callers can introspect the chosen background hex if needed
// (e.g. for a matching canvas frame border color in the UI).
export { DIAGRAM_BACKGROUNDS }
