# Generator v2

Standalone React 19 + Motion prototype for the NextWork project generator.
Demonstrates the outline-first + granularity-split + Shape-of-AI pattern
model. Lives alongside the existing `gen/generate-prototype.html` HTML
prototype during the rebuild.

## Stack

- Vite + React 19 + TypeScript (strict)
- Tailwind CSS v4 (tokens declared in `src/tokens.css`, wired via `@theme`)
- Motion (`import { motion } from 'motion/react'`, never barrel)
- Vercel serverless proxy at `api/claude.js` (reads `ANTHROPIC_API_KEY`)

## Local dev

```bash
cd gen/generator-v2
npm install         # coordinator approves first install
npm run dev         # Vite on http://localhost:5173
```

For local Claude calls during dev, run the existing proxy in a second terminal:

```bash
ANTHROPIC_API_KEY=sk-... node ../proxy.mjs
```

Vite forwards `/api/claude` to `localhost:3456` in dev. In production the
route is served by `api/claude.js` as a Vercel serverless function.

## Deploy

Auto-deploys on push to `jonnext/generator-prototype` main. Vercel already
has `ANTHROPIC_API_KEY` set on the project.

## Plan

See `~/.claude/plans/crystalline-roaming-volcano.md` for the full rebuild
plan, locked decisions, and the Shape of AI pattern palette.
