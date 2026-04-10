/**
 * Copy module for the Generator v2 prototype.
 *
 * Owned by the copy-writer teammate. Implementation imports from this file but
 * does not edit it. Tone: evidence-based, direct, educational, no em-dashes,
 * no motivational filler.
 *
 * Source of the tone choices: April 10 2026 critique session (Nat, Amber,
 * Maximus, Krishna) + Jon's voice preferences.
 */

// ---------------------------------------------------------------------------
// C1: Named Modes (replaces abstract Difficulty slider)
// ---------------------------------------------------------------------------

export type ModeId = 'beginner-guided' | 'intermediate' | 'advanced-minimal';

export interface Mode {
  id: ModeId;
  name: string;
  /** One-line plain-English description of the mode itself. */
  description: string;
  /** One-line statement of what the student should expect from the project. */
  expectations: string;
}

export const modes: Mode[] = [
  {
    id: 'beginner-guided',
    name: 'Beginner guided',
    description: 'Extra context, slower pacing, more validations.',
    expectations:
      "We walk through each step, link out to AWS docs for new terms, and flag the spots where things usually break.",
  },
  {
    id: 'intermediate',
    name: 'Intermediate',
    description: 'Assumes you have shipped something before.',
    expectations:
      "We skip the primer, stay on the critical path, and only stop to explain choices that are non-obvious.",
  },
  {
    id: 'advanced-minimal',
    name: 'Advanced minimal',
    description: 'Fastest pacing, no hand-holding.',
    expectations:
      "You get the commands, the config, and the gotchas. No setup explanations, no screenshots of buttons.",
  },
];

// ---------------------------------------------------------------------------
// C2: "I don't know, you tell me" rationale templates
// ---------------------------------------------------------------------------

/**
 * When the student picks the Randomize option on a pill row, the AI picks a
 * default and SHOWS this rationale. Keys match the pill category. Each
 * rationale names the chosen option, then explains the why in plain terms.
 */

export interface Rationale {
  /** The option the AI picked by default. */
  picked: string;
  /** Why it was picked, written to educate not justify. */
  body: string;
}

export const rationales: Record<string, Rationale> = {
  'container-service': {
    picked: 'ECS with Fargate',
    body:
      "ECS with Fargate is the most beginner-friendly way to run containers on AWS. There are no EC2 instances to manage, you pay per request instead of per hour, and the free tier covers 750 hours a month which is enough for a hands-on project.",
  },

  'deployment-method': {
    picked: 'AWS Console',
    body:
      "The AWS Console gives visual feedback for every click, so when something breaks you can see exactly where. CLI and Terraform are faster for repeat work, but you learn the service model faster by clicking through it the first time.",
  },

  runtime: {
    picked: 'Python',
    body:
      "Python has the richest ecosystem for AWS tutorials and the boto3 SDK is the most documented of all the AWS clients. If you get stuck, the answer is usually one search away in the same language.",
  },

  'api-framework': {
    picked: 'FastAPI',
    body:
      "FastAPI is the fastest-growing Python web framework. You get automatic OpenAPI docs, type validation from your function signatures, and async support without extra setup. It is also the framework most new Python API tutorials default to.",
  },

  'api-hosting': {
    picked: 'AWS Lambda',
    body:
      "Lambda is the cheapest place to host a low-traffic API. The free tier covers one million requests a month, and you do not pay for idle time. It also removes the server management work that usually trips people up on their first deploy.",
  },

  storage: {
    picked: 'Amazon S3',
    body:
      "S3 is the default object storage on AWS and the free tier gives you 5 GB for 12 months. It is the same service that sits behind most AWS tutorials, so the patterns you learn here transfer to almost every other project.",
  },

  database: {
    picked: 'DynamoDB',
    body:
      "DynamoDB has an always-free tier (25 GB, 25 write and 25 read capacity units), so you do not have to clean up when the project ends. The trade-off is that you need to think about access patterns up front, which is a useful habit to build.",
  },

  monitoring: {
    picked: 'CloudWatch',
    body:
      "CloudWatch is already collecting metrics from your AWS services by default. That means you can build a working dashboard and an alarm without installing anything, and the free tier covers a handful of custom metrics and alarms.",
  },

  'cicd-tool': {
    picked: 'GitHub Actions',
    body:
      "GitHub Actions is free for public repositories, lives in the same place as your code, and does not need a separate server. For a first pipeline, that is one less account to manage and one less thing that can go down.",
  },

  'deploy-target': {
    picked: 'Container',
    body:
      "Deploying a container is the pattern most production teams use, and it lines up with the other AWS services you are likely to touch next. Once you have the pipeline pushing to ECR and ECS, the same shape works for web apps, APIs, and workers.",
  },

  'monitor-target': {
    picked: 'API',
    body:
      "APIs are the easiest thing to monitor meaningfully because the key signals (error rate, latency, request count) are all things CloudWatch captures for you out of the box. It is a fast way to see monitoring pay off.",
  },
};

// ---------------------------------------------------------------------------
// C3: Research card option-comparison content
// ---------------------------------------------------------------------------

/**
 * Replaces the source-based research ("Perplexity said X") with option-
 * comparison content (ECS vs EKS vs Fargate with pros/cons). Keyed by
 * decisionType so a StepCard can look up the right comparison for its pill row.
 */

export interface ComparisonOption {
  name: string;
  /** Short "best for" line. Answers: when would I pick this? */
  bestFor: string;
  pros: string[];
  cons: string[];
}

export interface ResearchComparison {
  decisionType: string;
  question: string;
  options: ComparisonOption[];
}

export const researchComparisons: Record<string, ResearchComparison> = {
  'container-service': {
    decisionType: 'container-service',
    question: 'Which container service?',
    options: [
      {
        name: 'ECS with Fargate',
        bestFor: 'First-time container deploys and free-tier projects.',
        pros: [
          'No EC2 instances to manage',
          'Free tier covers 750 hours per month',
          'Fastest path from Dockerfile to running service',
        ],
        cons: [
          'Less flexible for advanced networking',
          'AWS-specific, does not transfer to other clouds',
        ],
      },
      {
        name: 'ECS on EC2',
        bestFor: 'When you need control over the host and want to stay on AWS.',
        pros: [
          'Cheaper at scale than Fargate',
          'Lets you attach GPUs or custom AMIs',
          'Familiar if you already run EC2',
        ],
        cons: [
          'You manage OS patches and cluster capacity',
          'More moving parts to debug on day one',
        ],
      },
      {
        name: 'EKS (Kubernetes)',
        bestFor: 'Teams that already use Kubernetes or need portable workloads.',
        pros: [
          'Standard Kubernetes API, skills transfer across clouds',
          'Huge ecosystem of controllers and operators',
          'Strong story for complex multi-service apps',
        ],
        cons: [
          'Steepest learning curve of the three',
          'Control plane costs $0.10 per hour, not free tier',
          'Heavy for a single-service project',
        ],
      },
    ],
  },

  'deployment-method': {
    decisionType: 'deployment-method',
    question: 'How do you want to deploy?',
    options: [
      {
        name: 'AWS Console',
        bestFor: 'Your first time with a service, or when you want to see what it does.',
        pros: [
          'Visual feedback at every step',
          'Error messages are easier to locate',
          'No tooling to install',
        ],
        cons: [
          'Not repeatable, easy to forget what you clicked',
          'Slower for changes after the first deploy',
        ],
      },
      {
        name: 'AWS CLI',
        bestFor: 'Scripting one-off tasks and speeding up repeat deploys.',
        pros: [
          'Fast, scriptable, works from any terminal',
          'Uses the same IAM permissions as the Console',
          'Great for learning what each API call does',
        ],
        cons: [
          'Commands can get long',
          'No drift detection, you have to remember state yourself',
        ],
      },
      {
        name: 'Terraform',
        bestFor: 'Real projects you will keep, or anything shared with a team.',
        pros: [
          'Infrastructure as code, reviewable in a pull request',
          'Handles drift and cleanup automatically',
          'Works across AWS, GCP, and Azure',
        ],
        cons: [
          'Extra tool to install and learn',
          'State file management is an extra responsibility',
        ],
      },
    ],
  },

  'api-framework': {
    decisionType: 'api-framework',
    question: 'Which API framework?',
    options: [
      {
        name: 'FastAPI',
        bestFor: 'New Python APIs where you want OpenAPI docs for free.',
        pros: [
          'Automatic OpenAPI and Swagger UI',
          'Type validation from function signatures',
          'Async support built in',
        ],
        cons: [
          'Younger community than Flask',
          'Fewer third-party extensions',
        ],
      },
      {
        name: 'Flask',
        bestFor: 'Small services or when you want minimal magic.',
        pros: [
          'Smallest API surface to learn',
          'Huge ecosystem of extensions',
          'Battle-tested in production',
        ],
        cons: [
          'No built-in validation or docs',
          'Async support requires extra setup',
        ],
      },
      {
        name: 'Express',
        bestFor: 'JavaScript shops or shared frontend/backend teams.',
        pros: [
          'Same language as the frontend',
          'Vast middleware ecosystem',
          'Deploys easily to Lambda or containers',
        ],
        cons: [
          'No built-in type validation',
          'Error handling is more manual than FastAPI',
        ],
      },
    ],
  },

  'api-hosting': {
    decisionType: 'api-hosting',
    question: 'Where will the API run?',
    options: [
      {
        name: 'AWS Lambda',
        bestFor: 'Low-traffic APIs and anything you do not want to babysit.',
        pros: [
          'Free tier covers 1 million requests per month',
          'No servers to patch or scale',
          'Pay only while a request is running',
        ],
        cons: [
          'Cold starts add latency on the first request',
          '15 minute maximum execution time',
        ],
      },
      {
        name: 'EC2',
        bestFor: 'Long-running processes or when you need full control.',
        pros: [
          'Full control over the OS and runtime',
          'No cold starts',
          'Works for any language or framework',
        ],
        cons: [
          'You manage patching, scaling, and uptime',
          'Costs run even when idle',
        ],
      },
      {
        name: 'Railway',
        bestFor: 'Side projects and fastest possible first deploy.',
        pros: [
          'Git push to deploy, no AWS setup',
          'Built-in databases and logs',
          'Generous free tier for small apps',
        ],
        cons: [
          'Not AWS, so AWS-specific skills do not carry over',
          'Less control over networking and security',
        ],
      },
    ],
  },

  'cicd-tool': {
    decisionType: 'cicd-tool',
    question: 'Which CI/CD tool?',
    options: [
      {
        name: 'GitHub Actions',
        bestFor: 'Projects already on GitHub and first-time pipeline builders.',
        pros: [
          'Free for public repos, generous free tier for private',
          'Lives in the same place as your code',
          'Huge marketplace of prebuilt actions',
        ],
        cons: [
          'Locked to GitHub',
          'Self-hosted runners take effort to secure',
        ],
      },
      {
        name: 'Jenkins',
        bestFor: 'Teams with existing Jenkins infrastructure or complex pipelines.',
        pros: [
          'Most flexible of the three',
          'Plugin ecosystem for almost any tool',
          'Self-hosted, you own the data',
        ],
        cons: [
          'You run the server and keep it patched',
          'Steeper learning curve than the others',
        ],
      },
      {
        name: 'GitLab CI',
        bestFor: 'Teams on GitLab or those that want everything in one UI.',
        pros: [
          'Built into GitLab, zero setup',
          'Single YAML file for the whole pipeline',
          'Good container registry integration',
        ],
        cons: [
          'Requires GitLab for the full experience',
          'Smaller action marketplace than GitHub',
        ],
      },
    ],
  },

  'monitoring-tool': {
    decisionType: 'monitoring-tool',
    question: 'Which monitoring tool?',
    options: [
      {
        name: 'CloudWatch',
        bestFor: 'AWS projects where you want monitoring to just work.',
        pros: [
          'Native to AWS, already collecting metrics',
          'Free tier covers the basics',
          'Alarms can trigger Lambda, SNS, and Auto Scaling',
        ],
        cons: [
          'Dashboards are less polished than Datadog',
          'Log search gets expensive at scale',
        ],
      },
      {
        name: 'Datadog',
        bestFor: 'Multi-cloud or production teams that live in dashboards.',
        pros: [
          'Best dashboards and alerting of the three',
          'One tool for metrics, logs, and traces',
          'Works across AWS, GCP, Azure, and on-prem',
        ],
        cons: [
          'Paid from day one',
          'Pricing can surprise you as data volume grows',
        ],
      },
      {
        name: 'Prometheus + Grafana',
        bestFor: 'Self-hosted setups and anyone learning the open source stack.',
        pros: [
          'Free and open source',
          'Industry standard for Kubernetes monitoring',
          'Grafana dashboards are highly customizable',
        ],
        cons: [
          'You run the Prometheus and Grafana servers',
          'Long-term metric storage needs extra work',
        ],
      },
    ],
  },

  'monitor-target': {
    decisionType: 'monitor-target',
    question: 'What are you monitoring?',
    options: [
      {
        name: 'Web app',
        bestFor: 'Public sites where uptime and page speed matter.',
        pros: [
          'Easy to observe from the user side',
          'Core signals are uptime and latency',
          'CloudFront and Route 53 health checks are free tier friendly',
        ],
        cons: [
          'Client-side errors are harder to capture',
          'Third-party dependencies can skew the numbers',
        ],
      },
      {
        name: 'API',
        bestFor: 'Backends where error rate and latency are the key signals.',
        pros: [
          'All three signals (errors, latency, throughput) are easy to collect',
          'Works well with Lambda, API Gateway, and ALB logs',
          'Fastest way to see monitoring pay off on day one',
        ],
        cons: [
          'Need to decide which status codes count as errors',
          'Latency percentiles take time to tune',
        ],
      },
      {
        name: 'Container',
        bestFor: 'Services running on ECS, EKS, or Fargate.',
        pros: [
          'Container Insights gives CPU, memory, and task health out of the box',
          'Good practice for production Ops',
          'Alarms can drive Auto Scaling directly',
        ],
        cons: [
          'Container Insights costs extra beyond the free tier',
          'Need to tag tasks cleanly to make dashboards useful',
        ],
      },
    ],
  },
};
