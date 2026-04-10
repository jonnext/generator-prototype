/**
 * Seed data for the Community Projects row on the Discovery screen.
 *
 * Owned by the copy-writer teammate. Hand-picked to cover a range of
 * technologies (AWS, Docker, AI/ML, Python, CI/CD) so novice, intermediate,
 * and advanced students all see a relevant entry point on first load.
 *
 * Real feed integration is deferred. These are the tiles the prototype ships
 * with for the Round 5 critique.
 *
 * Spread: 3 beginner, 3 intermediate, 2 advanced.
 */

import type { ModeId } from './copy';

export interface SeedProject {
  id: string;
  title: string;
  /** One-line description, ~100 chars. */
  description: string;
  mode: ModeId;
  estimatedMinutes: number;
  /** Category label shown on the tile. Keep short for mobile. */
  category: string;
}

export const seedProjects: SeedProject[] = [
  // --- Beginner guided -----------------------------------------------------
  {
    id: 'ecs-fargate-first-container',
    title: 'Deploy your first container on AWS with ECS Fargate',
    description:
      'Take a Docker image, push it to ECR, and run it on Fargate using the AWS Console. Free tier friendly.',
    mode: 'beginner-guided',
    estimatedMinutes: 45,
    category: 'AWS',
  },
  {
    id: 's3-static-site',
    title: 'Host a static website on S3 and CloudFront',
    description:
      'Launch a personal site with HTTPS, a custom domain, and global caching. No servers involved.',
    mode: 'beginner-guided',
    estimatedMinutes: 30,
    category: 'AWS',
  },
  {
    id: 'bedrock-chatbot',
    title: 'Build a chatbot with Amazon Bedrock',
    description:
      'Call Claude through Bedrock from a Lambda function and wire it to a simple web UI.',
    mode: 'beginner-guided',
    estimatedMinutes: 40,
    category: 'AI/ML',
  },

  // --- Intermediate --------------------------------------------------------
  {
    id: 'fastapi-lambda-crud',
    title: 'Ship a FastAPI CRUD backend on Lambda',
    description:
      'Build a typed REST API with FastAPI, connect it to DynamoDB, and deploy through API Gateway.',
    mode: 'intermediate',
    estimatedMinutes: 60,
    category: 'Python',
  },
  {
    id: 'github-actions-deploy-ecs',
    title: 'Automate ECS deploys with GitHub Actions',
    description:
      'Build a pipeline that runs tests, pushes to ECR, and deploys to ECS on every merge to main.',
    mode: 'intermediate',
    estimatedMinutes: 50,
    category: 'CI/CD',
  },
  {
    id: 'cloudwatch-api-dashboard',
    title: 'Build a CloudWatch dashboard and alarms for a live API',
    description:
      'Track error rate, latency, and request count. Wire alarms to SNS and write a one-page runbook.',
    mode: 'intermediate',
    estimatedMinutes: 45,
    category: 'Observability',
  },

  // --- Advanced minimal ----------------------------------------------------
  {
    id: 'eks-terraform-production',
    title: 'Stand up a production EKS cluster with Terraform',
    description:
      'Provision EKS with managed node groups, IAM roles for service accounts, and a sample workload.',
    mode: 'advanced-minimal',
    estimatedMinutes: 90,
    category: 'Kubernetes',
  },
  {
    id: 'rag-pipeline-opensearch',
    title: 'Build a RAG pipeline with Bedrock and OpenSearch',
    description:
      'Index a document set into OpenSearch, retrieve with semantic search, and generate answers with Claude.',
    mode: 'advanced-minimal',
    estimatedMinutes: 120,
    category: 'AI/ML',
  },
];
