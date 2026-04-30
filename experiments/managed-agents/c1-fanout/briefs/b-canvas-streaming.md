# Brief — Session B: ChatGPT-Canvas-style inline streaming preview

You are implementing **one of two parallel design directions** for the C-1 Plan-Then-Build move on the NextWork generator prototype. Your variant is the **ChatGPT Canvas / Bolt.new** approach: no explicit mode toggle — the outline streams in inline, with the metadata row and pill machinery hidden until the user clicks an inline "Generate full project →" button.

## Your repo

The prototype lives at `/Users/jonneylon/Dev/Nextwork/generator-prototype-v2/` (mounted into your container working directory). It's a Vite + React + TypeScript + Motion + Tailwind app.

**Your branch:** `experiment/c1-canvas-streaming` — create from `main` and only push to this branch. Do not touch `main`.

## Strategic context (read first)

- The decision artboards on Paper are the spec. Read them before touching code:
  - **Artboard 02 — StepCard 4-state machine** (`node-id 558-0`) — shows the existing per-step states. Your variant doesn't need a new top-level phase; instead, it gates the *visibility* of the MetadataRow and the per-step pills/chips on a local "previewing vs full" boolean.
  - **Artboard 06 — Pattern A vs Pattern B** (`node-id 5D2-0`) — your variant is also Pattern B-aligned, but more inline. The user shapes the plan by reading what streams in, then commits via a less ceremonial "Generate full project →" affordance.

Use the Paper MCP `get_jsx` tool on those node IDs to read the artboard structure. Do not write to the canvas.

## What to build

1. **No new Phase type** — keep `Phase = 'idle' | 'materializing' | 'learning' | 'focused'` unchanged. Your variant operates inside `'materializing' → 'learning'` like today.

2. **Add a local "preview" state to CanvasScreen** — likely a boolean like `outlinePreview` that defaults to `true` once `actionPlan` lands and flips to `false` when the user clicks the inline CTA.

3. **Update `src/screens/CanvasScreen.tsx`** so that while `outlinePreview === true`:
   - Top bar — unchanged
   - `ProjectHeader` — unchanged (header types in)
   - `ArchitectureDiagram` — **must remain the centerpiece** (non-negotiable). It still mounts ~200ms after `actionPlan` lands.
   - **No `MetadataRow`** — collapsed away entirely
   - **`StepCard` rendered with `mode: 'compact'`** — heading + summary chip strip only (you'll likely add a `mode` prop to `StepCard`, same shape as the Replit-toggle variant uses, but here gated on the local preview state, not on a global phase)
   - **A new inline `GenerateFullProjectButton` component** — sits below the last step heading, less ceremonial than the Replit CTA. Copy: "Generate full project →" or similar. On click: `setOutlinePreview(false)`.

4. **Once `outlinePreview === false`**: render today's full canvas — `MetadataRow` + `StepCard` in `mode: 'full'` (block body + pills + ResearchCard on expand).

5. **Streaming feel**: the cascade timing already handles the labor-illusion — keep it. Your variant's distinguishing move is that *what streams in* is the heading-only outline first, full content on demand.

6. **Type-safety**: run `npm run typecheck` and ensure it passes. If it doesn't, fix the source errors. **Do not** suppress with `@ts-ignore` or `as any`.

## Files you may edit

- `src/screens/CanvasScreen.tsx` — local outlinePreview state + render branches
- `src/components/canvas/StepCard.tsx` — add the `mode` prop (or similar) to support compact rendering
- (new) `src/components/canvas/GenerateFullProjectButton.tsx` — inline reveal CTA
- `src/motion/choreography.ts` — only if you need a new reveal variant for the preview→full transition

## Files you must NOT edit

- `src/lib/state.ts` — your variant does NOT add a new Phase. Leave the type alone.
- `src/App.tsx` — your variant lives entirely inside CanvasScreen. App routing is unchanged.
- Anything in `src/components/discovery/`
- `src/components/canvas/MetadataRow.tsx` — don't change its API; just gate its render in CanvasScreen
- `vite.config.ts`, `package.json`, `tsconfig.json`
- Anything in `experiments/`

## When you're done

1. Stage your changes, commit with message `experiment(c1): ChatGPT-Canvas-style inline streaming preview`
2. Push to `origin experiment/c1-canvas-streaming`
3. Print a short summary: which files changed, line counts, typecheck result, key design decisions you made
4. Emit `session.status_idle`

## Non-negotiables

- The architecture diagram remains the centerpiece while previewing.
- Type-safety must hold.
- No edits outside the listed files.
- Your branch must not touch `main`.
- The `Phase` type in `state.ts` is unchanged — that's the discriminator between this variant and Session A's.
- If you're stuck or need to deviate from the brief in a substantive way, document why in your final summary — don't silently ship a different design.
