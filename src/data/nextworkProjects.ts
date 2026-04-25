// Catalogue of real NextWork courses, sourced from
// /Users/jonneylon/Dev/Nextwork/content/courses/<slug>/metadata.yml.
//
// `track` is a normalised UI label derived from the yaml `type` field:
//   roadmap   → Roadmaps
//   specialty → Specialty
//   tool      → Tools
//
// Image paths reference /public/images/projects/<file>.webp — populated
// by copying /content/courses/static/*.webp on 2026-04-25.

export type ProjectTrack = 'Roadmaps' | 'Specialty' | 'Tools'

export interface NextworkProject {
  id: string
  title: string
  track: ProjectTrack
  image: string
  description?: string
}

export const NEXTWORK_PROJECTS: NextworkProject[] = [
  // Roadmaps
  {
    id: 'ai-finops',
    title: 'FinOps x AI',
    track: 'Roadmaps',
    image: '/images/projects/finops-ai.webp',
    description: 'Learn to ship an e-commerce site with AI!',
  },
  {
    id: 'ai-fundamentals',
    title: 'Beginner AI Projects',
    track: 'Roadmaps',
    image: '/images/projects/icelandic-vibes.webp',
    description: 'Build your first few AI projects — agents, MCPs, chatbots, RAG.',
  },
  {
    id: 'ai-second-brain',
    title: 'AI Second Brain',
    track: 'Roadmaps',
    image: '/images/projects/pyramid.webp',
    description: 'Turn scattered notes into an AI-powered knowledge base.',
  },
  {
    id: 'ai-security',
    title: 'Security x AI',
    track: 'Roadmaps',
    image: '/images/projects/night-sky.webp',
    description: 'Build automated security scanners with AI.',
  },
  {
    id: 'ai-workspace',
    title: 'AI Tooling',
    track: 'Roadmaps',
    image: '/images/projects/flower-garden.webp',
    description: 'Set up your AI workspace — Cursor, Claude, OpenClaw, Ollama.',
  },
  {
    id: 'aws-beginners',
    title: 'Cloud Beginner Challenge',
    track: 'Roadmaps',
    image: '/images/projects/mayan-jungle.webp',
    description: 'Build four essential AWS projects in this beginner-friendly challenge.',
  },
  {
    id: 'aws-ccp',
    title: 'AWS Cloud Practitioner',
    track: 'Roadmaps',
    image: '/images/projects/farm.webp',
    description: 'Path to AWS Certified Cloud Practitioner.',
  },
  {
    id: 'ci-cd-pipeline',
    title: '6 Day DevOps Challenge',
    track: 'Roadmaps',
    image: '/images/projects/underwater.webp',
    description: 'Build your DevOps portfolio in six days.',
  },
  {
    id: 'claude',
    title: 'Claude',
    track: 'Roadmaps',
    image: '/images/projects/claude-series.webp',
    description: 'Build with every Anthropic Claude surface.',
  },
  {
    id: 'claude-code',
    title: 'Claude Code',
    track: 'Roadmaps',
    image: '/images/projects/claudecode-series.webp',
    description: 'Use Claude Code to build your own projects.',
  },
  {
    id: 'cloud-devops',
    title: 'DevOps',
    track: 'Roadmaps',
    image: '/images/projects/mountain.webp',
    description: 'For experienced learners ready to ship DevOps on AWS.',
  },
  {
    id: 'cloud-engineer',
    title: 'Cloud Engineer',
    track: 'Roadmaps',
    image: '/images/projects/clouds.webp',
    description: 'The essential skills you need to be a Cloud Engineer.',
  },
  {
    id: 'cloud-security',
    title: 'Cloud Security',
    track: 'Roadmaps',
    image: '/images/projects/cloud-security.webp',
    description: 'Master AWS security from IAM to network security.',
  },
  {
    id: 'cybersecurity',
    title: 'Cybersecurity',
    track: 'Roadmaps',
    image: '/images/projects/cybersecurity.webp',
    description: 'Enterprise-level security skills, end-to-end.',
  },
  {
    id: 'dev-sec-ops',
    title: 'DevSecOps',
    track: 'Roadmaps',
    image: '/images/projects/egypt.webp',
    description: 'Security and infrastructure behind the cloud.',
  },
  {
    id: 'generative-ai-developer',
    title: 'Generative AI Developer',
    track: 'Roadmaps',
    image: '/images/projects/potions.webp',
    description: 'Build production-ready generative AI on AWS.',
  },
  {
    id: 'new',
    title: 'Newest Projects',
    track: 'Roadmaps',
    image: '/images/projects/forest.webp',
    description: 'The latest projects we have released this month.',
  },
  {
    id: 'security-engineer',
    title: 'Security Engineer',
    track: 'Roadmaps',
    image: '/images/projects/bamboo.webp',
    description: 'AWS security fundamentals for the Security Engineer path.',
  },
  {
    id: 'solutions-architect',
    title: 'Solutions Architect',
    track: 'Roadmaps',
    image: '/images/projects/mountain-japan.webp',
    description: 'Practical knowledge for the Solutions Architect exam.',
  },

  // Specialty
  {
    id: 'ai-ml',
    title: 'AI / ML',
    track: 'Specialty',
    image: '/images/projects/mushroom.webp',
    description: 'AI and Machine Learning, all levels.',
  },
  {
    id: 'compute',
    title: 'Compute',
    track: 'Specialty',
    image: '/images/projects/into-the-light.webp',
    description: 'AWS compute primitives — EC2, ECS, Lambda, beyond.',
  },
  {
    id: 'databases',
    title: 'Databases',
    track: 'Specialty',
    image: '/images/projects/sandy-jungle.webp',
    description: 'Relational and non-relational databases at all levels.',
  },
  {
    id: 'networks',
    title: 'Networks',
    track: 'Specialty',
    image: '/images/projects/beach.webp',
    description: 'Networking in AWS, all levels.',
  },
  {
    id: 'productivity',
    title: 'Productivity',
    track: 'Specialty',
    image: '/images/projects/observatory.webp',
    description: 'Ship more with AI as your daily operating system.',
  },
  {
    id: 'prompt-engineering',
    title: 'Prompt Engineering',
    track: 'Specialty',
    image: '/images/projects/prompt-engineering.webp',
    description: 'Get the most out of AI tools through better prompting.',
  },
  {
    id: 'security',
    title: 'Security',
    track: 'Specialty',
    image: '/images/projects/cowboy-dessert.webp',
    description: 'Develop skills in cloud security.',
  },
  {
    id: 'storage',
    title: 'Storage',
    track: 'Specialty',
    image: '/images/projects/cavern.webp',
    description: 'Beginner-friendly storage on AWS.',
  },
  {
    id: 'three-tier',
    title: 'Three-Tier Architecture',
    track: 'Specialty',
    image: '/images/projects/sky-islands.webp',
    description: 'Build a three-tier architecture web app, layer by layer.',
  },

  // Tools
  {
    id: 'account-management',
    title: 'Account Management',
    track: 'Tools',
    image: '/images/projects/swamp.webp',
    description: 'AWS admin and account setup, all levels.',
  },
  {
    id: 'amazon-dynamodb',
    title: 'Amazon DynamoDB',
    track: 'Tools',
    image: '/images/projects/nosql.webp',
    description: 'Master NoSQL with DynamoDB and serverless Lambda.',
  },
  {
    id: 'amazon-eks',
    title: 'Amazon EKS',
    track: 'Tools',
    image: '/images/projects/kubernetes-cloud.webp',
    description: 'Kubernetes on AWS with Amazon EKS.',
  },
  {
    id: 'amazon-lex',
    title: 'Amazon Lex',
    track: 'Tools',
    image: '/images/projects/waterfall.webp',
    description: 'Build an AI chatbot with Amazon Lex.',
  },
  {
    id: 'amazon-rds',
    title: 'Amazon RDS',
    track: 'Tools',
    image: '/images/projects/database.webp',
    description: 'Relational databases in the cloud with Amazon RDS.',
  },
  {
    id: 'amazon-vpc',
    title: 'Amazon VPC',
    track: 'Tools',
    image: '/images/projects/fields-of-gold.webp',
    description: 'Virtual Private Cloud, from basics to deep cuts.',
  },
  {
    id: 'aws-cloudformation',
    title: 'AWS CloudFormation',
    track: 'Tools',
    image: '/images/projects/infrastructure-code.webp',
    description: 'Infrastructure as Code with CloudFormation.',
  },
  {
    id: 'aws-codeartifact',
    title: 'AWS CodeArtifact',
    track: 'Tools',
    image: '/images/projects/package-manager.webp',
    description: 'Secure package management with CodeArtifact.',
  },
  {
    id: 'aws-codebuild',
    title: 'AWS CodeBuild',
    track: 'Tools',
    image: '/images/projects/build-automation.webp',
    description: 'CI/CD foundation with AWS CodeBuild.',
  },
  {
    id: 'aws-codedeploy',
    title: 'AWS CodeDeploy',
    track: 'Tools',
    image: '/images/projects/deployment.webp',
    description: 'Automate application deployment.',
  },
  {
    id: 'aws-codepipeline',
    title: 'AWS CodePipeline',
    track: 'Tools',
    image: '/images/projects/pipeline.webp',
    description: 'Orchestrate the ultimate CI/CD pipeline.',
  },
  {
    id: 'aws-lambda',
    title: 'AWS Lambda',
    track: 'Tools',
    image: '/images/projects/serverless.webp',
    description: 'Go serverless with the Lambda + DynamoDB trilogy.',
  },
  {
    id: 'aws-secrets-manager',
    title: 'AWS Secrets Manager',
    track: 'Tools',
    image: '/images/projects/security.webp',
    description: 'Secure your applications with Secrets Manager.',
  },
  {
    id: 'cursor',
    title: 'Cursor',
    track: 'Tools',
    image: '/images/projects/wellington-1.webp',
    description: 'The AI-native IDE — learn it deeply.',
  },
  {
    id: 'docker',
    title: 'Docker',
    track: 'Tools',
    image: '/images/projects/whale.webp',
    description: 'Get to the bottom of what Docker actually is.',
  },
  {
    id: 'kubernetes',
    title: 'Kubernetes',
    track: 'Tools',
    image: '/images/projects/harbour.webp',
    description: 'Hands-on intro to Kubernetes for DevOps.',
  },
  {
    id: 'mcps',
    title: 'Model Context Protocol',
    track: 'Tools',
    image: '/images/projects/lake.webp',
    description: 'Connect AI agents to external services with MCP.',
  },
  {
    id: 'n8n',
    title: 'n8n',
    track: 'Tools',
    image: '/images/projects/n8n-automation.webp',
    description: 'Build your first AI workflow with n8n.',
  },
  {
    id: 'ollama',
    title: 'Ollama',
    track: 'Tools',
    image: '/images/projects/greenhouse.webp',
    description: 'Run LLMs locally with Ollama.',
  },
  {
    id: 'openclaw',
    title: 'Build with OpenClaw',
    track: 'Tools',
    image: '/images/projects/shipwreck.webp',
    description: 'Your own 24/7 AI assistant — install, integrate, automate.',
  },
  {
    id: 'terraform',
    title: 'Terraform',
    track: 'Tools',
    image: '/images/projects/infrastructure-automation.webp',
    description: 'Infrastructure as Code with Terraform on AWS.',
  },
]
