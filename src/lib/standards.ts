// NextWork Step Content Standards — DP1.5 prototype subset.
//
// Ported from ~/Dev/Nextwork/projects-app/backend/projects/projectv2/standards/
// step_content.md (as of 2026-04-17) with three deliberate changes:
//
//  1. Scoped to the 5 block types the prototype ports in DP1.5.A:
//       paragraph | heading | list | code | callout
//     References to validation, validationBox, step, tabGroup, quiz,
//     secretMission, divider, image, and videoEmbed are stripped.
//
//  2. Launchpad and Basket paragraph rules removed.
//     Production's narrative assumes a fixed step sequence where Step N
//     references Step N-1 and teases Step N+1. The prototype's dynamic
//     pathway (DP1) lets students append/remove/insert steps at any time,
//     so cross-step references would go stale. Each step narrates itself.
//
//  3. "Step 1 Special Rules" removed. Production reserves Step 1 for
//     setup-only content (Step 0 is a single validation); the prototype
//     does not have a Step 0 and students can submit prompts that start
//     at any point in a learning journey.
//
// When production's standards evolve, re-sync this file manually per
// assumption 5 in the plan. Kept as a single template literal so the
// section-generator prompt can embed it verbatim with no transformation.

export const NEXTWORK_STEP_STANDARDS = `# NextWork Step Content Standards

Your job is to write one step's body content as a JSON array of content blocks.
Follow these standards exactly — the renderer validates the output against
them and will retry on failure.

## Required Block Structure Per Step

### 1. Opening Narrative (ParagraphBlock)

- 1-3 sentences explaining the step's purpose and value.
- First sentence grounds the reader in the overall project context.
- Focus on the PROBLEM this step solves, not just the technical outcome.
- Connect the step to the overall project goal.

Correct: "To create our temperature converter we need to build, run, and
update a React app. To build our app we'll use Vite, a modern build tool.
In this step, we'll install both Node.js and Vite."

Incorrect: "Let's install Node.js, the JavaScript runtime we'll use, and
Vite for scaffolding our React project."

The correct example grounds the reader in the project goal first, then
introduces the tools. The incorrect example jumps straight into tooling
without context.

### 2. Task List (ListBlock)

- listType: "task" (checkbox format)
- Immediately preceded by a ParagraphBlock containing bold text:
  "In this step, get ready to:"
- 2-3 items listing major tasks or outcomes.
- Every item ends with a full stop.

### 3. Substeps (max 3 per step)

Each substep follows this pattern:

- HeadingBlock level 4 — action-oriented title (start with a verb).
  Only level 4 headings are allowed inside a step body. Never emit
  level 1, 2, or 3 headings.
- Optional ParagraphBlock — 1-3 sentence description. Include ONLY when
  a concept genuinely needs explaining. Skip when the action is
  self-explanatory.
- ListBlock (listType: "unordered") — bullet instructions, one action
  per item, action-verb-led.
- Optional CodeBlock — commands or code snippets.

## Bullet Instruction Rules

- Start each item with an action verb.
- One action per bullet.
- Use the "bold" mark for UI elements (buttons, menu items, field names).
- Use the "code" mark for values, file names, commands.
- Be specific about what to click, type, or select.

Correct:
- "Click **New Pipeline** in the top right corner."
- "Select **GitHub** as your code source."
- "Enter \`main\` in the branch filter field."

Incorrect:
- "Create a new pipeline by clicking the button."
- "Choose GitHub."
- "Type main."

### What Is NOT a Bullet Instruction

These must be ParagraphBlocks, not ListBlock items:

- Observations: text describing what the learner sees or what happened.
- Commentary: reactions or narration.
- State descriptions: what a setting currently shows.

Do not combine an action with an observation in a single ListBlock item.
Keep the action as a bullet and move the observation to a following
ParagraphBlock.

## Callouts (CalloutBlock)

Use a callout when a specific tool, technique, or approach is chosen over
a common alternative and the learner might default to the alternative on
their own.

Variants:
- "tip": pro tip or shortcut.
- "info": background context.
- "troubleshooting": pitfall or common error.
- "announcement": new feature or deprecation.
- "costWarning": pricing note.
- "error": warning about something that will break.

A CalloutBlock has a title and nested blocks (typically 1-2 ParagraphBlocks).
Keep callouts short — they are side notes, not main content.

## Writing Rules

- Direct and encouraging: "Click **Save**" not "You should click Save".
- Second person: "You'll configure..." not "The user configures...".
- Present tense: "This creates..." not "This will create...".
- Active voice: "Azure DevOps runs the build" not "The build is run".
- No em dashes. Use regular dashes or commas.
- No motivational filler. No "let's dive in". No "exciting".

## Keyboard Shortcuts

Always show both platforms inline in a ParagraphBlock:
"Press **Cmd+Shift+P** (macOS) or **Ctrl+Shift+P** (Windows)"

Use bold marks for key combinations. macOS first, then Windows.

## Substep Description Rules

USE descriptions when:
- Learner needs conceptual understanding ("why" this matters).
- Introducing a new concept or technology.
- Complex procedure requiring context.

SKIP descriptions when:
- Action is straightforward and self-explanatory.
- Instructions are clear on their own.

## Redundant Action Lines

If a level-4 HeadingBlock already states the action, do NOT add a
ListBlock item that restates the same action. Go straight to the
CodeBlock or specific instructions.

Correct (heading is enough):
- HeadingBlock: "Install Dependencies and Pull the Embedding Model"
- CodeBlock follows directly.

Incorrect (redundant restatement):
- HeadingBlock: "Install Dependencies and Pull the Embedding Model"
- ListBlock item: "Install the four packages your project needs."
- CodeBlock follows.

## Step Length Guidelines

- Each step achieves ONE major accomplishment.
- Max 3 substeps per step.
- Target 5-10 minutes of work per step.

## Language Rules

- "Set up" (two words) = verb. "Setup" (one word) = noun or adjective.
- Scaffold comments in code blocks should explain "why" or the goal, not
  restate the variable name.

## Code Block Internal Spacing

Inside CodeBlocks, use single blank lines to separate logical sections.
Never use double blank lines.

## Anti-Patterns

### Structure
- Missing task list.
- Task list without listType: "task".
- Steps without opening narrative.
- More than 3 substeps (request split into multiple steps instead).
- HeadingBlock level 1, 2, or 3 inside a step (only level 4 allowed).

### Content
- Descriptions on every substep (include only when needed).
- Vague instructions ("configure the settings appropriately").
- Multiple actions in one list item.
- Missing bold marks on UI elements.
- Long paragraphs where a ListBlock would read better.
- Non-action text as list items.
- Bolded bullet point actions (only substep headings should be bold).

### Tone
- Passive voice.
- Condescending explanations.
- Uncertainty ("You might want to try...").
`
