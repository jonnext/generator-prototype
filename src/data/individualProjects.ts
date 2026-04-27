// Individual NextWork projects — the building blocks inside a course
// series. Sourced from /Users/jonneylon/Dev/Nextwork/content/projects/
// <slug>/metadata.yml on 2026-04-27.
//
// Naming caveat: the existing `nextworkProjects.ts` file actually holds
// course-series data (a legacy domain mismatch). We're not renaming it
// to avoid churn; this new file holds individual projects.
//
// Visual treatment: projects DON'T have generated icon images on disk
// (the metadata.yml `icon:` paths reference files that aren't built in
// this content repo). For the prototype we render each project as a
// colored monogram thumbnail — the project's first letter on a gradient
// block derived from its category — alongside title + description + the
// time and difficulty chips.

export type ProjectDifficulty =
  | 'Easy'
  | 'Easy peasy'
  | 'Mildly spicy'
  | 'Very spicy'

export interface IndividualProject {
  /** Slug — matches the directory name in /content/projects/ */
  id: string
  title: string
  description: string
  category: string
  difficulty: ProjectDifficulty
  /** Free-form duration string from metadata, e.g. "45 min", "60 min". */
  time: string
  /** ISO date string for sorting "Newest". */
  lastModified: string
  /** Tags surfaced in the metadata's `concepts` array, stripped of HTML
   *  links. We strip because some metadata stores anchor markup. */
  concepts: string[]
  /** Optional series part — populated when the project is multi-part
   *  (e.g., "Build an AI Second Brain" has part 1 and part 2). */
  part?: number
}

export const INDIVIDUAL_PROJECTS: IndividualProject[] = [
  {
    id: 'ai-claude-code',
    title: 'Get Started with Claude Code',
    description: 'Build a personal portfolio website using Claude Code in your terminal.',
    category: 'Claude Code',
    difficulty: 'Easy',
    time: '45 min',
    lastModified: '2026-03-01',
    concepts: ['Claude Code', 'HTML/CSS', 'Cursor'],
  },
  {
    id: 'ai-claude-compare',
    title: 'Explore Claude.ai, Code, and Cowork',
    description: 'Use three Claude tools to explore, build, and organize cloud salary data.',
    category: 'Claude',
    difficulty: 'Easy peasy',
    time: '60 min',
    lastModified: '2026-03-17',
    concepts: ['Claude AI', 'Claude Code', 'Cowork'],
  },
  {
    id: 'ai-claude-code-skills',
    title: 'Claude Code Skills Basics',
    description: 'Build Git-powered Claude Code Skills that auto-commit and generate changelogs.',
    category: 'Claude Code',
    difficulty: 'Mildly spicy',
    time: '60 min',
    lastModified: '2026-03-04',
    concepts: ['Claude Code', 'Claude Code Skills', 'Git', 'Conventional Commits'],
  },
  {
    id: 'claude-code-statusline',
    title: "Set Up Claude Code's Status Line",
    description: 'Set up a live Claude Code status line showing model, context, and cost.',
    category: 'Claude Code',
    difficulty: 'Easy peasy',
    time: '45 min',
    lastModified: '2026-03-16',
    concepts: ['Claude Code', 'Context Window', 'Node.js'],
  },
  {
    id: 'claude-code-safety-guardrails',
    title: 'Set Up Claude Code Guardrails',
    description: 'Configure permission rules, hooks, and CLAUDE.md to secure Claude Code.',
    category: 'Claude Code',
    difficulty: 'Mildly spicy',
    time: '60 min',
    lastModified: '2026-03-20',
    concepts: ['Claude Code', 'Hooks', 'Permissions', 'Defense-in-Depth'],
  },
  {
    id: 'ai-git-worktrees',
    title: 'Claude Code with Git Worktrees',
    description: 'Build a budget tracker with parallel Claude Code worktree sessions.',
    category: 'Claude Code',
    difficulty: 'Mildly spicy',
    time: '60 min',
    lastModified: '2026-04-02',
    concepts: ['Git Worktrees', 'Claude Code'],
  },
  {
    id: 'ai-second-brain-claude-code',
    title: 'Build an AI Second Brain with Claude Code',
    description: "Set up an AI-powered knowledge base using Karpathy's LLM Wiki pattern with Claude Code and Obsidian.",
    category: 'AI Second Brain',
    difficulty: 'Easy',
    time: '60 min',
    lastModified: '2026-04-14',
    concepts: ['Claude Code', 'Obsidian', 'Markdown'],
    part: 1,
  },
  {
    id: 'ai-second-brain-claude-code-2',
    title: 'Automate Your AI Second Brain',
    description: 'Turn your Obsidian vault into a daily operating system with Claude Code.',
    category: 'AI Second Brain',
    difficulty: 'Easy',
    time: '60 min',
    lastModified: '2026-04-23',
    concepts: ['Claude Code Desktop', 'Obsidian', 'GitHub', 'Model Context Protocol (MCP)'],
    part: 2,
  },
  {
    id: 'ai-design-engineering',
    title: 'Design to Code: Paper + Claude Code via MCP',
    description: 'Turn a Paper design into a live React + Tailwind site using Claude Code over MCP.',
    category: 'AI Design',
    difficulty: 'Mildly spicy',
    time: '90 min',
    lastModified: '2026-04-23',
    concepts: ['Paper', 'MCP', 'Claude Code', 'React'],
    part: 1,
  },
  // AWS foundations — high-reuse, beginner-friendly building blocks.
  {
    id: 'aws-account-setup',
    title: 'Set Up An AWS Account',
    description: "Set up your AWS account so you're ready to build cloud projects.",
    category: 'Account Management',
    difficulty: 'Easy peasy',
    time: '10 min',
    lastModified: '2026-02-19',
    concepts: ['AWS', 'IAM', 'Account Setup'],
  },
  {
    id: 'aws-host-a-website-on-s3',
    title: 'Host a Website on Amazon S3',
    description: 'Host your very own website on Amazon S3.',
    category: 'Cloud Beginner Challenge',
    difficulty: 'Easy peasy',
    time: '45 min',
    lastModified: '2026-02-25',
    concepts: ['AWS', 'S3', 'Static Hosting'],
  },
  {
    id: 'aws-security-iam',
    title: 'Cloud Security with AWS IAM',
    description: 'Use IAM to control access to your AWS resources.',
    category: 'Cloud Beginner Challenge',
    difficulty: 'Easy peasy',
    time: '60 min',
    lastModified: '2026-03-02',
    concepts: ['AWS', 'IAM', 'Security'],
  },
  {
    id: 'aws-networks-vpc',
    title: 'Build a Virtual Private Cloud',
    description: 'Learn the networking backbone of AWS — Amazon VPC.',
    category: 'Amazon VPC',
    difficulty: 'Easy peasy',
    time: '60 min',
    lastModified: '2026-03-08',
    concepts: ['AWS', 'VPC', 'Networking'],
  },
  {
    id: 'aws-genai-bedrock-chatbot',
    title: 'Build an AI Chatbot with Amazon Bedrock',
    description: 'Use Amazon Bedrock and Python to build an AI chatbot in your browser.',
    category: 'Generative AI Developer',
    difficulty: 'Easy peasy',
    time: '60 min',
    lastModified: '2026-03-16',
    concepts: ['AWS', 'Bedrock', 'Python', 'Generative AI'],
  },
]

/** Filter by concept (case-insensitive substring match). Used by the
 *  "Build with Claude" row — pass `'Claude'` to surface every Claude or
 *  Claude Code project regardless of formatting. */
export function projectsByConcept(needle: string): IndividualProject[] {
  const lower = needle.toLowerCase()
  return INDIVIDUAL_PROJECTS.filter((project) =>
    project.concepts.some((concept) => concept.toLowerCase().includes(lower)),
  )
}
