# Interaction Model Research Brief
*For the Generator v2 review meeting*

## 1. The Claim (30 seconds to read)

NextWork's production generator requires three chat turns — experience level, tools, budget — before producing any outline. Generator v2 inverts the flow: the skeleton outline generates immediately (~600ms) from inferred defaults, those inferences appear as persistent editable pills, and every downstream element (step pills, research cards, inpainting handles) is a direct-manipulation edit surface. Same Basket/Objective/Key Actions/Launchpad output format (verified: `src/components/canvas/StepBody.tsx`, `src/lib/inpainting.ts:107-125`). Same data model. Inverted cognitive flow.

**Verdict: CONDITIONALLY SUPPORTED.**

The literature robustly supports the core design — articulation gates fail novices, worked examples beat blank-start specification, direct manipulation beats conversational read-modify-write — and industry has converged on the starting-surface pattern (ChatGPT Canvas, Claude Artifacts, v0, Figma First Draft). But the support is conditional on a specific requirement: **the pills must make the AI's inferences visible and invite correction.** Otherwise the same literature predicts automation bias and design fixation. The prototype mostly meets this bar. Two code-level gaps (silent default pills, destructive chat-interrupt) are real risks engineers will surface, and the brief names them honestly.

---

## 2. The Three Points That Survive Scrutiny

### Point 1 — Articulation gates fail novices

The production flow demands self-report of experience and tool familiarity before generating anything. This requires metacognition novices by definition lack. **Kruger & Dunning** (*JPSP* 77(6), 1999) showed the bottom quartile of performers systematically overestimates their own ability — the same metacognitive deficits that produce poor performance also prevent accurate self-appraisal. **Kalyuga, Ayres, Chandler & Sweller** (*Educational Psychologist* 38(1), 2003) formalized the expertise reversal effect: instructional support that helps novices is neutral or harmful for experts, which means a mis-calibrated self-report lands the system on the wrong side of the reversal. **Nuseibeh & Easterbrook** (*ICSE 2000*) is software engineering's canonical view of why upfront requirements elicitation alone fails: stakeholder needs are partly tacit and surface through interaction with artifacts, not through direct questioning.

**Prototype mapping.** Generator v2 accepts that novices can't yet articulate and provides defaults: `src/lib/state.ts:83-87` sets `{ duration: '30min', mode: 'intermediate', budget: 'free-tier' }`. The skeleton generates immediately in ~600ms (`src/App.tsx:150-215`) without gating on whether pills have been set. The pills then become the reactive surface the student corrects — precisely what **Wood, Bruner & Ross** (*J Child Psychology* 17(2), 1976) defined as contingent scaffolding: read from behavior, not pre-declared.

**Anticipated objection.** *"Three questions take ten seconds. This isn't really a cognitive cost."*
**Rebuttal.** The cost isn't typing time — it's being asked to commit to a self-assessment the learner hasn't earned. **Buçinca, Malaya & Gajos** (*CSCW 2021*) showed cognitive-forcing interventions help high-Need-for-Cognition users but leave lower-motivation learners *worse* off. Forced upfront specification is a cognitive-forcing function applied unselectively, and it falls hardest on exactly the students NextWork's learning product is trying to serve.

### Point 2 — Worked examples + self-explanation outperform blank-start specification

**Sweller & Cooper** (*Cognition and Instruction* 2(1), 1985) is the foundational empirical result: novices given worked examples followed by similar problems outperformed novices given equivalent time to solve problems from scratch, with lower reported cognitive load. **Atkinson, Derry, Renkl & Wortham** (*Review of Educational Research* 70(2), 2000) consolidate twenty years of replications of the worked-examples effect. **Renkl** (*Cognitive Science* 38(1), 2014) frames the mechanism: example study is maximally effective during initial skill acquisition *when accompanied by self-explanation prompts*. **Kelley's Wizard-of-Oz methodology** (*ACM TOIS* 2(1), 1984) validated in HCI that concrete simulated outputs surface requirements users cannot state upfront.

**Prototype mapping.** Skeleton generation (`src/App.tsx:150-215`) produces a worked example in ~600ms. Every step then exposes self-explanation scaffolds: `src/components/canvas/StepPill.tsx:47-161` forces the student to explicitly accept or substitute each design decision; `src/components/canvas/ResearchCard.tsx:28-89` surfaces the reasoning behind each default and can be compared without committing; `InpaintingHandle` actions (`src/App.tsx:364-420`) make modification a single tap rather than a read-modify-write prose cycle. This is Renkl's "example + self-explanation" configuration, literally instantiated as UI.

**Anticipated objection (this one is strong, name it first).** **Wadinambiarachchi, Kelly, Pareek, Zhou & Velloso** (*CHI '24*, "The Effects of Generative AI on Design Fixation and Divergent Thinking") is directly on point: participants given AI-generated examples during ideation produced fewer ideas, less variety, and lower originality than baseline. Design fixation on AI output is real and the paper tests the *exact mechanism* the prototype uses.

**Rebuttal.** The fixation finding is valid when the artifact is presented *passively*. **Jansson & Smith** (*Design Studies* 12(1), 1991) showed fixation persists across metacognitive instructions to "be different" — but their subjects couldn't modify the example. The prototype rewards divergence structurally: every pill has an explicit "I don't know, you tell me" AI-randomize button (`StepPill.tsx:120-126`), research cards surface alternatives without commitment, and inpainting treats regeneration as a first-class operation. Fixation risk is real — but it's mitigated by making the *cost* of divergence near-zero. This mitigation is a design claim, not a measured outcome; see Research Gaps §6.

### Point 3 — Direct manipulation beats conversational read-modify-write for structured artifact editing

**Shneiderman** (*IEEE Computer* 16(8), 1983) defined direct manipulation by three properties: continuous representation of the object, physical actions instead of complex syntax, and rapid reversible operations with immediately visible effect. **Hutchins, Hollan & Norman** (*HCI* 1(4), 1985) formalized the cognitive claim: directness is achieved when "the world of interest is explicitly represented and there is no intermediary between user and world." Chat-as-editor is precisely the linguistic intermediary their paper was written against. **Luger & Sellen** (*CHI 2016*, "Like Having a Really Bad PA") found that the absence of visible state after natural-language intent caused users to discover agent failures only after the fact. **Horvitz's mixed-initiative principles** (*CHI 1999*) explicitly warn against dialog steps whose interruption cost exceeds their informational value. And most directly: **Amin, Kühle, Buschek et al.** (*CHI 2025*, "Composable Prompting Workspaces for Creative Writing") empirically compared a widget-based editing surface against chat for iterating on LLM output and found widgets supported exploration and iteration better — parameters could be re-edited in place without re-prompting.

**Prototype mapping.** Five orthogonal edit channels, four of which require zero typing:
- MetadataRow pill cycle — single click advances option (`src/components/canvas/MetadataRow.tsx:118-148`)
- StepPill toggles + "I don't know" AI pick (`src/components/canvas/StepPill.tsx:47-161`)
- ResearchCard comparisons without commitment (`src/components/canvas/ResearchCard.tsx:28-89`)
- InpaintingHandle actions — simplify/extend/rewrite/regenerate (`src/App.tsx:364-420`)
- Chat as *supplementary context channel* that re-runs the skeleton (`src/App.tsx:321-354`) — critically, chat **cannot** directly mutate step bodies. This enforces Hutchins/Hollan/Norman's "no linguistic intermediary" principle at the code level.

**Anticipated objection.** *"Chat is faster for users who already know what they want."*
**Rebuttal.** True — for users who have a clear model of the artifact. **Grudin** (*CACM* 32(10), 1989, "The Case Against User Interface Consistency") is the honest caveat: structured interfaces help users who share the mental model and hurt users who don't. But NextWork's target population is novices who *don't yet have the model* — that's the whole reason they're in a learning product. Luger & Sellen's CHI 2016 finding is exactly that conversational agents fail users who can't yet articulate, which is the same population the production flow's three-turn gate is currently blocking.

---

## 3. Where The Engineers Are Right

This is the section that earns the brief credibility. The counter-evidence is real, and pretending otherwise will lose the meeting.

**Kapur's productive failure.** **Sinha & Kapur** (*Review of Educational Research* 91(5), 2021) meta-analyzed productive failure and found Cohen's *d* = 0.36 for conceptual understanding, CI [0.20, 0.51]. Forcing students to articulate *even unsuccessfully* is a documented learning mechanism. The version of "AI pays the cognitive cost" that sounds like "AI removes struggle" is exactly the version Kapur's work contradicts. **The defensible reframe**: the pills don't remove struggle — they *relocate* it from articulation (which novices fail at) to critique and modification (which the literature shows they can do against a concrete artifact). If production engineers hear the pitch and think "you're just making things easier," they've heard it wrong. This is the single most important distinction to land in the meeting.

**Bansal, Nushi, Kamar, Lasecki, Weld & Horvitz** (*HCOMP 2019*, "Beyond Accuracy: The Role of Mental Models in Human-AI Team Performance"). Team performance requires accurate mental models of the AI's competence. Eager generation with *invisible* defaults degrades calibration. `src/lib/state.ts:83-87` does set default pills silently, and skeleton generation fires whether or not the student touched them. This is a real gap: if students miss the pills, they get a worked example without understanding which inferences it rests on. **The mitigation is trivial** — make the default state visually distinct from user-confirmed state (e.g., ghosted until touched) — but it needs to exist before the meeting, or an engineer will use it as evidence the thesis is half-implemented.

**The hard-reset chat interrupt** (`src/App.tsx:342-344`, acknowledged in the code comment). Mid-generation chat messages abort the current run and regenerate the entire skeleton, resetting pill selections to null. This is the *opposite* of "malleable surface" — it's a destructive transition. The honest answer is "yes, chat-as-context is the least polished channel and needs work; but chat is not the primary edit path, so this degrades a secondary channel, not the core claim." Name it before the engineers do.

**The 84%-vs-9.7-point gap.** The research folder's headline statistic — "84% preference for GenUI" (Stanford SALT Lab, arXiv 2508.19227) — is from a *controlled Claude-3.7 researcher-constructed comparison*, not real users. The same paper's real-user preference is 50.8% vs 41.1% — a 9.7-point gap, not a 43-point gap. The 9.7-point gap is still directionally significant and far more defensible. **Action item before the meeting**: `Immediate Outline vs Deferred Output.md` currently leads with the 84% figure — correct it to the 50.8% real-user figure, or an engineer who reads the source will end the review.

**Design fixation is real and not fully mitigated.** The prototype's explicit "I don't know" button and research cards reduce fixation risk but don't eliminate it. Wadinambiarachchi et al. (*CHI '24*) is exactly the paper an engineer would bring to the meeting, and "we reward divergence" is a design claim, not a measured outcome. Honest position: a small internal user study comparing outline originality between production and v2 is the right next step before generalizing.

**Internal contradiction in the research folder** (flagged by the inventory agent): the backend audit (`generator-backend-audit-report.md`) treats sculpting as an *open hypothesis*, while the research spine (`generator-v2-research-spine.md`) treats it as the committed direction. An engineer reading both documents will spot the tension. Reconcile them into one framing before the meeting: "we committed to sculpting based on [this evidence]; the open question is [this narrow thing], which we'll test via [this experiment]."

---

## 4. The Framing That Lands

The original framing — *"output as starting surface vs committed artifact"* — is close, but one word is off. The production flow isn't a committed artifact. It's a *deferred* one, gated behind three articulation questions the learner cannot yet answer.

**Refined framing for the meeting:**

> The production flow defers the outline behind articulation the learner can't yet produce. Generator v2 renders the AI's inferences as the first thing on screen, then makes every inference a direct-manipulation surface the learner can correct. Same output format, same data model — but the cognitive work shifts from *"specify upfront"* (which the literature shows novices fail at) to *"critique and modify a concrete example"* (which the literature shows they can do).

**One-sentence version engineers should hear first:**

> Your disagreement isn't aesthetic — it's about where the learner is forced to do the hard part. Your flow puts it on articulation; ours puts it on critique. The literature has been clear which of those is the job novices are actually equipped to do.

**Supporting rhetoric — the industry move, in two quotes**:

- **Anthropic** (2024-06-21, Claude 3.5 Sonnet launch): *"This preview feature marks Claude's evolution from a conversational AI to a collaborative work environment."*
- **OpenAI** (2024-10-03, ChatGPT Canvas launch): *"A new way of working together — not just through conversation, but by creating and refining ideas side by side."*

Every major AI lab shipped a canvas/artifact surface between June and October 2024 for the same reason: linear chat forces a read-modify-write loop that kills iteration on structured artifacts. The production flow's three-turn discovery is that same loop. The industry has already named the fix.

---

## 5. Source Appendix

### Tier 1 — Peer-reviewed HCI / cognitive science / educational psychology

- Amin, R. M., Kühle, O. H., Buschek, D., et al. (2025). *Composable Prompting Workspaces for Creative Writing*. Proc. CHI 2025.
- Atkinson, R. K., Derry, S. J., Renkl, A., & Wortham, D. (2000). *Learning from Examples: Instructional Principles from the Worked Examples Research.* Review of Educational Research 70(2), 181–214.
- Bansal, G., Nushi, B., Kamar, E., Lasecki, W. S., Weld, D. S., & Horvitz, E. (2019). *Beyond Accuracy: The Role of Mental Models in Human-AI Team Performance.* Proc. HCOMP 2019, 7(1), 2–11.
- Buçinca, Z., Malaya, M. B., & Gajos, K. Z. (2021). *To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI in AI-Assisted Decision-Making.* Proc. ACM HCI (CSCW) 5, Article 188.
- Clark, H. H., & Brennan, S. E. (1991). *Grounding in Communication.* In Resnick, Levine, & Teasley (Eds.), Perspectives on Socially Shared Cognition, 127–149.
- Grudin, J. (1989). *The Case Against User Interface Consistency.* CACM 32(10), 1164–1173.
- Horvitz, E. (1999). *Principles of Mixed-Initiative User Interfaces.* Proc. CHI 1999, 159–166.
- Hutchins, E., Hollan, J., & Norman, D. (1985). *Direct Manipulation Interfaces.* Human-Computer Interaction 1(4), 311–338.
- Jansson, D. G., & Smith, S. M. (1991). *Design Fixation.* Design Studies 12(1), 3–11.
- Kalyuga, S., Ayres, P., Chandler, P., & Sweller, J. (2003). *The Expertise Reversal Effect.* Educational Psychologist 38(1), 23–31.
- Kapur, M. (2008). *Productive Failure.* Cognition and Instruction 26(3), 379–424.
- Kelley, J. F. (1984). *An Iterative Design Methodology for User-Friendly Natural Language Office Information Applications.* ACM TOIS 2(1), 26–41.
- Kruger, J., & Dunning, D. (1999). *Unskilled and Unaware of It.* JPSP 77(6), 1121–1134.
- Kulkarni, C., Dow, S., & Klemmer, S. (2012). *Early and Repeated Exposure to Examples Improves Creative Work.* Stanford HCI / CogSci 2012.
- Luger, E., & Sellen, A. (2016). *"Like Having a Really Bad PA": The Gulf between User Expectation and Experience of Conversational Agents.* Proc. CHI 2016, 5286–5297.
- Nuseibeh, B., & Easterbrook, S. (2000). *Requirements Engineering: A Roadmap.* Proc. ICSE 2000, 35–46.
- Parasuraman, R., & Manzey, D. H. (2010). *Complacency and Bias in Human Use of Automation.* Human Factors 52(3), 381–410.
- Parasuraman, R., & Riley, V. (1997). *Humans and Automation: Use, Misuse, Disuse, Abuse.* Human Factors 39(2), 230–253.
- Renkl, A. (2014). *Toward an Instructionally Oriented Theory of Example-Based Learning.* Cognitive Science 38(1), 1–37.
- Reps, T., & Teitelbaum, T. (1981). *The Cornell Program Synthesizer.* CACM 24(9), 563–573.
- Risko, E. F., & Gilbert, S. J. (2016). *Cognitive Offloading.* Trends in Cognitive Sciences 20(9), 676–688.
- Shneiderman, B. (1983). *Direct Manipulation: A Step Beyond Programming Languages.* IEEE Computer 16(8), 57–69.
- Sinha, T., & Kapur, M. (2021). *When Problem Solving Followed by Instruction Works: Evidence for Productive Failure.* Review of Educational Research 91(5), 761–798.
- Stanford SALT Lab (2025). *Generative Interfaces for Language Models.* arXiv:2508.19227. (Real-user preference 50.8% vs 41.1%.)
- Sweller, J., & Cooper, G. A. (1985). *The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra.* Cognition and Instruction 2(1), 59–89.
- Sweller, J., Van Merriënboer, J. J. G., & Paas, F. (1998). *Cognitive Architecture and Instructional Design.* Educational Psychology Review 10(3), 251–296.
- Wadinambiarachchi, S., Kelly, R. M., Pareek, S., Zhou, Q., & Velloso, E. (2024). *The Effects of Generative AI on Design Fixation and Divergent Thinking.* Proc. CHI '24.
- Wood, D., Bruner, J. S., & Ross, G. (1976). *The Role of Tutoring in Problem Solving.* J Child Psychology 17(2), 89–100.
- "Scaffold or Crutch?" (2024). arXiv:2412.02653. STEM students bypassing thinking with chat-only AI.

### Tier 2 — Books by recognized authorities

- Bruner, J. S. (1966). *Toward a Theory of Instruction.* Belknap Press.
- Chi, M. T. H., Glaser, R., & Farr, M. J. (Eds.) (1988). *The Nature of Expertise.* LEA.
- Grice, H. P. (1975). *Logic and Conversation.* In Cole & Morgan (Eds.), Syntax and Semantics 3.
- Schön, D. A. (1983). *The Reflective Practitioner.* Basic Books.
- Thaler, R. H., & Sunstein, C. R. (2008). *Nudge.* Yale University Press.

### Tier A/B/C — Industry (with evidence-standard ranking)

- **Anthropic** (2024-06-21). *Introducing Claude 3.5 Sonnet.* Tier C. https://www.anthropic.com/news/claude-3-5-sonnet
- **OpenAI** (2024-10-03). *Introducing Canvas.* Tier C. https://openai.com/index/introducing-canvas/
- **Vercel** — v0 product posts and composite model benchmarks. Tier A (error-rate benchmarks) / Tier C (product intent).
- **Pragmatic Engineer (Gergely Orosz)** — *How Anthropic Built Artifacts* (interview with Michael Gerstenhaber). Tier B.
- **Figma First Draft**, **Framer AI**, **Notion AI**, **Cursor Composer/Agent mode** — product documentation, Tier C.
- **Maggie Appleton** — *Squish Meets Structure.* Future Frontend 2024. Tier B.
- **Geoffrey Litt** — malleable software framing. geoffreylitt.com. Tier B.

### Counter-evidence appendix (engineers should hear these)

- Wadinambiarachchi et al. (CHI '24) — design fixation from AI examples
- Bansal et al. (HCOMP 2019) — mental model formation needs
- Kapur / Sinha & Kapur — productive failure (*d* = 0.36)
- Parasuraman & Riley (1997) — automation misuse
- Glean (2026) enterprise search evaluation — retrieval tasks favor upfront context

### Unverifiable citations to REMOVE from internal documents before the meeting

These appear in the research folder but could not be verified by external search:
- "The Keyhole Effect (arXiv 2026)" — no arXiv ID, no authors, search returns nothing matching
- "Solus low-literacy study — 100% vs 70% completion"  — no author, URL, or paper
- "Agency Gap study" — no metadata
- "Artium 2026 — Dynamic Blocks pattern" — no URL, no author
- "OpenAI developer community 2025 — UI is part of AI's cognitive logic" — forum post with no URL

---

## 6. Research Gaps

- **No head-to-head RCT comparing "generate-first + editable pills" against "question-first + chat edit" on total user effort AND learning outcomes.** The evidence here is triangulation across cognitive science, CLT, and mixed-initiative. A modest internal A/B (20–40 students, measuring completion rate + outline originality + self-reported confidence) would be the single highest-value follow-up study.
- **No measurement of design-fixation risk on the prototype specifically.** Wadinambiarachchi et al. is directly on-point; the mitigation claim ("we reward divergence") is asserted, not tested. Minimum bar: a small task comparing outline originality between production and v2.
- **The `state.ts:83-87` silent defaults need a visual fix before the meeting.** Bansal et al. (HCOMP 2019) is explicit that hidden AI defaults degrade mental-model calibration. Shipping a ghosted/unconfirmed visual state for untouched pills is a ~1-hour fix and closes an engineer-facing gap.
- **The chat-interrupt hard-reset (`App.tsx:342-344`) needs acknowledgement or a fix.** The honest framing is "secondary channel, not load-bearing on the core claim" — but if it's a foregone conclusion that this will be fixed, say so in the meeting.
- **No activation/retention metrics for Canvas / Artifacts / v0 have been published.** The industry pattern is strong directionally but not empirically validated. The brief treats this as supporting rhetoric, not primary evidence.
- **No product in the 2024–2026 window was found that tried the starting-surface pattern and reverted.** Absence of evidence, not evidence of absence — but worth naming.
- **Kulkarni, Dow & Klemmer (2012) effect sizes** for early-example exposure need to be double-checked in the original paper before being put on a slide.

---

*End of brief. Main body (excluding appendix) ≈ 2,400 words.*
