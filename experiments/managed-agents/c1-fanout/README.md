# C-1 Fan-Out — 2-session Managed Agents experiment

Two parallel Claude Managed Agents sessions implementing the deferred **C-1 Plan-Then-Build** decision on the prototype, each on its own branch.

| Session | Direction | Branch |
|---|---|---|
| A | Replit-style explicit toggle (`Phase: 'planning'` → `'Start building →'` CTA) | `experiment/c1-replit-toggle` |
| B | ChatGPT-Canvas inline streaming (no mode toggle, `outlinePreview` local state) | `experiment/c1-canvas-streaming` |

The plan is `/Users/jonneylon/.claude/plans/continuing-from-yesterday-s-session-deep-swan.md`. The strategic context is in `/Users/jonneylon/Documents/obsidian-vault/...` and on the Paper canvas (Artboards 02 + 06).

## What's in this directory

```
c1-fanout/
├── orchestrator.ts        — fires both sessions in parallel, streams events
├── package.json           — pinned deps (@anthropic-ai/sdk, tsx, typescript)
├── briefs/
│   ├── a-replit-toggle.md — Session A brief (full design spec)
│   └── b-canvas-streaming.md — Session B brief (full design spec)
├── logs/                  — per-session JSONL event logs (gitignored)
└── README.md              — this file
```

The per-session brief is what gets passed as the first user message to each session. Both reference Paper artboards `558-0` (StepCard 4-state) and `5D2-0` (Pattern A/B) — sessions read these via the Paper MCP `get_jsx` tool.

## Prerequisites (do these before running)

### 1. ant CLI (optional but recommended for inspection)

```bash
brew install anthropics/tap/ant
ant --version
```

Useful for inspecting agents, environments, and sessions outside the orchestrator. Not strictly required — the orchestrator only uses the SDK.

### 2. API key + beta access

```bash
export ANTHROPIC_API_KEY="sk-..."
```

The `managed-agents-2026-04-01` beta is enabled by default on all API accounts. The SDK sets the beta header automatically.

### 3. SDK install (in this directory)

```bash
cd experiments/managed-agents/c1-fanout
npm install
```

This installs `@anthropic-ai/sdk` and `tsx` locally (won't pollute the prototype's package.json).

### 4. Clean working tree

The agents will check out a new branch from `main`. Make sure the prototype's working tree is clean — commit or stash any pending changes first.

```bash
cd /Users/jonneylon/Dev/Nextwork/generator-prototype-v2
git status   # should be clean
git checkout main && git pull
```

## Run

```bash
cd experiments/managed-agents/c1-fanout
npx tsx orchestrator.ts
```

You'll see both sessions stream their progress to stdout, with `[session A]` / `[session B]` prefixes. Full event logs land in `logs/`.

Expected wall time: 10–30 min (sessions run in parallel; total time ≈ slowest session). Expected cost: $5–15.

## After the run

1. **Verify both branches landed**:

   ```bash
   git fetch
   git branch -r | grep experiment/c1-
   ```

2. **Local checkout — Session A**:

   ```bash
   cd /Users/jonneylon/Dev/Nextwork/generator-prototype-v2
   git checkout experiment/c1-replit-toggle
   npm install
   npm run dev
   ```

   Expected behavior: submit a prompt → "Plan view" renders header + diagram + step headings + "Start building →" CTA. Click CTA → MetadataRow + StepCard pills appear.

3. **Local checkout — Session B**:

   ```bash
   git checkout experiment/c1-canvas-streaming
   npm install
   npm run dev
   ```

   Expected behavior: submit a prompt → step headings stream in via cascade. No MetadataRow visible. Inline "Generate full project →" button reveals the rest on click.

4. **Architecture diagram check**: in both variants, the diagram remains the centerpiece. If it's been buried, that's a regression — the brief calls it out as non-negotiable.

5. **Read the per-session summaries** that the agents printed at session-end. They'll list which files changed, key design decisions, and any deviations from the brief.

## Safety / scope

- Both sessions write to **branches**, not main. Branches are namespaced `experiment/c1-*`.
- Sessions are **time-capped at 30 min each** (soft cap — orchestrator logs a warning if exceeded but continues streaming so a partial commit can still land).
- The Paper canvas is **read-only** for both sessions. No agent writes to the canvas.
- Cost ceiling: $5–15 expected. The orchestrator prints token + time totals at the end so you can verify.

## Cleanup (if either branch is bad)

```bash
git push origin --delete experiment/c1-replit-toggle
git push origin --delete experiment/c1-canvas-streaming
git branch -D experiment/c1-replit-toggle experiment/c1-canvas-streaming
```

The Anthropic-side resources (agent, environments, sessions) auto-clean — no destroy step needed for the API.
