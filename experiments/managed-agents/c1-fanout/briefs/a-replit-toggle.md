# Brief — Session A: Replit-style explicit Plan-Then-Build toggle

You are implementing **one of two parallel design directions** for the C-1 Plan-Then-Build move on the NextWork generator prototype. Your variant is the **Replit Plan Mode** approach: a discrete pre-commit "Plan view" with an explicit "Start building →" CTA that flips the canvas into the existing learning phase.

## Your repo

The prototype lives at `/Users/jonneylon/Dev/Nextwork/generator-prototype-v2/` (mounted into your container working directory). It's a Vite + React + TypeScript + Motion + Tailwind app.

**Your branch:** `experiment/c1-replit-toggle` — create from `v2-outline-experiment` (this is the active prototype branch; `master` is the older default branch). Only push to your experiment branch. Do not touch `v2-outline-experiment` or `master`.

## Strategic context (read first)

- The decision artboards on Paper are the spec. Read them before touching code:
  - **Artboard 02 — StepCard 4-state machine** (`node-id 558-0`) — shows the existing pending/generating/ready+collapsed/ready+expanded states. Your variant adds a *fifth* parent-level state at the canvas level: `planning` (pre-commit). Step cards in `planning` mode render heading-only.
  - **Artboard 06 — Pattern A vs Pattern B** (`node-id 5D2-0`) — your variant is the canonical Pattern B implementation. The user-shapes-plan-pre-commit step is rust-highlighted as "the leverage point." Your CTA must respect that — clicking it is the explicit commit moment.

Use the Paper MCP `get_jsx` tool on those node IDs to read the artboard structure. Do not write to the canvas.

## What to build

1. **Add `'planning'` to the `Phase` union type** in `src/lib/state.ts`. It should be the *initial* phase after submit, before `'materializing'`. The progression becomes: `idle → planning → materializing → learning → focused`.

2. **Update `src/App.tsx`** so that on prompt submit, `setPhase('planning')` fires (not `'materializing'`). The transition to `'materializing'` happens when the user clicks the new CTA, not automatically.

3. **Update `src/screens/CanvasScreen.tsx`** to render a lean Plan view when `phase === 'planning'`:
   - Top bar (Back, ResearchPulse) — unchanged
   - `ProjectHeader` (typewriter title + description) — unchanged
   - `ArchitectureDiagram` — **must remain the centerpiece** (universal positive — non-negotiable)
   - **No `MetadataRow`** in plan view (it's collapsed away entirely)
   - **Step list rendered heading-only** — use the existing `StepCard` component but in a new "compact" mode that shows just the index + heading (you'll likely add a prop like `mode: 'compact' | 'full'` and gate the body, chips, and pills on `mode === 'full'`)
   - **A new `StartBuildingCTA` component** — a single prominent button at the bottom of the canvas, styled to feel like a deliberate commit. Copy: "Start building →". On click: `setPhase('learning')` via the existing `setPhase` prop.
   - Keep the existing materializing cascade timing for when the user transitions to `'materializing'`.

4. **Type-safety**: run `npm run typecheck` and ensure it passes. If it doesn't, fix the source errors. **Do not** suppress with `@ts-ignore` or `as any`.

## Files you may edit

- `src/lib/state.ts` — add `'planning'` to `Phase`
- `src/App.tsx` — phase routing
- `src/screens/CanvasScreen.tsx` — render branch for `phase === 'planning'`
- `src/components/canvas/StepCard.tsx` — add the `mode` prop (or similar) to support compact rendering
- (new) `src/components/canvas/StartBuildingCTA.tsx` — the new commit CTA component
- `src/motion/choreography.ts` — only if you need a new reveal variant for the plan→build transition

## Files you must NOT edit

- Anything in `src/components/discovery/` (Discovery surface is out of scope this run)
- `src/components/canvas/MetadataRow.tsx` — already collapsed in this session's work; don't change its API
- `vite.config.ts`, `package.json`, `tsconfig.json` — no infrastructure changes
- Anything in `experiments/` — that's where you live; don't pollute it from inside

## When you're done

1. Stage your changes, commit with message `experiment(c1): Replit-style Plan view → Start building toggle`
2. Push to `origin experiment/c1-replit-toggle`
3. Print a short summary: which files changed, line counts, typecheck result, key design decisions you made
4. Emit `session.status_idle`

## Non-negotiables

- The architecture diagram remains the centerpiece in plan view.
- Type-safety must hold.
- No edits outside the listed files.
- Your branch must not touch `v2-outline-experiment` or `master`.
- If you're stuck or need to deviate from the brief in a substantive way, document why in your final summary — don't silently ship a different design.
