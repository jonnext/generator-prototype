// Hand-picked roadmap series for the "Featured Roadmaps" Spotify-style
// row on Discovery. Lifting the curation into a constant keeps it easy
// to swap (just reorder slugs) without editing component code.
//
// The slugs reference IDs in `nextworkProjects.ts` — the existing course
// catalogue. The Featured Roadmaps row resolves these to the full series
// records at render time.
//
// Picks cover the breadth of NextWork's offering: Claude, AI, AWS, second
// brain, cloud, devops, generative AI, and certification — so a student
// landing cold sees one "natural" path no matter what they've come for.

export const FEATURED_ROADMAP_SLUGS = [
  'claude-code',
  'ai-fundamentals',
  'aws-beginners',
  'ai-second-brain',
  'cloud-engineer',
  'ci-cd-pipeline',
  'generative-ai-developer',
  'solutions-architect',
] as const

export type FeaturedRoadmapSlug = (typeof FEATURED_ROADMAP_SLUGS)[number]
