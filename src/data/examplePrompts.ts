// Example prompts shown above the Generate input on Discovery.
// Clicking a pill autofills the input — submit is still student-driven.
// Copy lifted from Paper frame `31R-0` "Explore Starting Point".

export const EXAMPLE_PROMPTS = [
  'A daily AI briefing with OpenClaw',
  'A Hermes Autonomous agent',
  'a Claude app for my fitness goals',
  'A containerised API on AWS',
] as const

export type ExamplePrompt = (typeof EXAMPLE_PROMPTS)[number]
