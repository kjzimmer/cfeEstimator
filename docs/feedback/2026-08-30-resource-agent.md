# Resource Agent — estimation loop, confidence, and self-teaching evidence capture

Builds on `2026-08-28-resource-requirements-foundation.md`'s manual data model with the
actual estimation loop, per `docs/incoming/task-resource-pipeline.md` §4 as
substantially refined in conversation with Karl. Three design questions drove
the shape of this build; recording the reasoning since none of it is obvious
from the code alone.

## 1. "Does the agent have what it needs, and should it flag its own certainty?"

Discussed and confirmed before building: the agent reuses the same context
the Task Agent already assembles (`buildProjectContext`, now exported for
reuse) plus three things specific to estimation — the approved task list,
active semantic memory (CFE-specific tendencies, when any exist), and the
rate card vocabulary (so descriptions land on exact matches in the mechanical
grouping step more often). Real, named limitation: no CFE-specific
resource-tendency memory existed before this build, so early runs lean
entirely on general construction knowledge — expected, not a bug, and it's
exactly what the evidence-capture loop below is meant to start correcting.

Confidence: extended `task_dependencies`' existing `confident`/
`uncertainty_note` pattern to `task_resource_requirements` rather than
inventing a new shape. Karl's framing: this matters *more* here than for
task sequencing, since a quantity is a continuous guess (soil type, access,
weather) rather than a discrete before/after judgment.

## 2. "Every choice needs a basis" — decomposed, not just asserted

Karl's requirement: a number like "5 backhoe hours" has to trace to
something — productivity rate, quantity of material, terrain difficulty —
not just a bare assertion with a vague sentence attached. Added
`basis_quantity`/`basis_quantity_unit`/`basis_rate`/`basis_rate_unit` as
**nullable, optional** columns alongside the existing free-text `rationale`,
rather than forcing one structured shape onto every resource type: labor/
equipment estimates are almost always `scope quantity ÷ productivity rate`
and populate these fields; a flat item (permit fee) has nothing to
decompose and leaves them null. `rationale` still carries the full
explanation either way. This makes a bad estimate's root cause
distinguishable later (bad rate assumption vs. bad scope assumption), not
just visible as one wrong number.

## 3. Agents flagging their own process weaknesses — activating a reserved path, not new architecture

Karl wants every agent (not just this one) to be able to surface its own
process weak points, and wants the system to *learn* from both human and
agent feedback without a separate learning cycle that pulls humans out of
their normal workflow. Two distinct mechanisms came out of that
conversation, deliberately different in shape:

- **Systemic process gaps → `procedural_memory.source = 'agent_proposed'`.**
  This value has existed in the schema's CHECK constraint since Phase 1,
  explicitly reserved and never written — "proactive capture is explicitly
  out of scope for Phase 1," per the original comment. Activated now:
  `memoryService.proposeFromAgent()` writes into the *exact same* human
  review queue human-submitted procedural entries already use (`listProposals`
  doesn't filter by source). Added `source_refs` to `procedural_memory`
  (mirroring `semantic_memory`'s existing shape) so a proposal cites what
  triggered it — without this, an agent's observation would float
  context-free in the review queue. Deliberately narrow: the tool's
  description instructs "sparingly, at most once or twice per run, never
  per task" — this is for structural observations, not a running commentary.

- **Per-estimate corrections → automatic semantic memory evidence.** This is
  the "teach the agent, but not as a separate cycle" piece. Editing an
  AI-generated (`resource_estimation`) requirement through the normal
  Tasks-tab edit UI — which a human would do anyway while reviewing the
  work order — now triggers `memoryService.recordResourceCorrection()`
  automatically: if the original estimate cited a semantic memory
  hypothesis, the correction appends an evidence entry to it; if it didn't,
  a brand-new `hypothesis`-status entry gets created, seeded with the
  correction as its first evidence. This writes directly into
  `semantic_memory` bypassing the Phase 1 proposal queue — the schema
  comment already reserved exactly this ("Phase 2's rationale-driven
  agent_inferred path... writes directly into this same table"). Hypothesis
  entries feed future prompts immediately via the existing
  `listActiveSemantic()` (already includes `hypothesis`, not just
  `confirmed`) — no human review gate before it starts influencing
  estimates, by design.

**Explicitly not built, and not a small gap**: nothing yet promotes an
accumulating hypothesis to `confirmed` or retires it — that's the Company
Memory Agent (`task-resource-pipeline.md` §7), still unbuilt. A hypothesis
just accumulates evidence and quietly keeps influencing prompts until that
piece exists. Flagging this clearly rather than implying the loop is
closed: right now a bad correction has no counterweight beyond a human
noticing it in the Memory Review page's "Active" list.

**Also explicitly deferred**, per earlier conversation: agents asking
clarifying questions in the project chat mid-run. Held off deliberately as
a separate, harder problem (blocking/async concerns) — this build only does
the passive/fire-and-forget flagging described above.

## What's built

- Schema: `confident`/`uncertainty_note`/`basis_*` on
  `task_resource_requirements`; `source_refs` on `procedural_memory`;
  `resource_generation_runs` (mirrors `task_generation_runs` exactly — same
  async/poll/token-ceiling/dev-trace shape).
- `resourceAgentService.js`: single-phase loop (no draft/sequence split
  needed here, unlike Task/Dependency Agent) with the same structural-
  verification discipline that caught the Task Agent's orphan bug — after
  the main pass, a repair pass targets any approved task that got no
  requirement at all, and the run reports `stopped` naming anything still
  missing rather than trusting its own stop_reason.
- `memoryService.js`: `proposeFromAgent()`, `recordResourceCorrection()`.
- `resourceRequirementService.updateRequirement()` now fetches the pre-edit
  row and calls the evidence-capture hook — lives in the service, not the
  route, so any future caller gets the same behavior for free.
- UI: resource requirement rows are now fully editable (previously add/
  remove only, matching the dependency picker's lighter pattern) — needed
  so a human can actually correct an AI estimate's qty/basis, not just
  delete and retype it. Shows rationale, basis (as `qty unit ÷ rate unit`),
  and an amber/dashed "uncertain" treatment matching the existing
  low-confidence convention used elsewhere (task dependency edges in the
  network diagram). "Generate Resource Requirements" button mirrors
  "Generate Tasks" exactly (async trigger + poll, opaque while running).

## A real bug this surfaced, fixed same session

`MemoryReviewPage.jsx` rendered `source_refs` with a bare `.join('; ')`,
which only ever worked because every existing entry's refs were plain
strings. The first agent-generated correction (a structured
`{ type, id }` object, matching how `tasks`/`task_dependencies` already cite
sources) rendered as `[object Object]` — caught via the same live-browser
verification discipline used throughout this project, not by reading the
diff. Fixed with a `formatSourceRef()` helper that handles both shapes;
also widened `ProposalRow`/`ActiveRow` to read `source_refs` regardless of
entry type, since procedural entries can now carry them too.

## Verification

Ran end-to-end against the Benfatti Fire Debris Removal project's real
approved task list, not synthetic data:
- Agent produced 22 resource requirements across ~2 rounds (well under the
  15-round cap — it stops itself once it believes it's done, not when
  budget runs out), each with rationale and, where applicable, a basis.
- 2 requirements correctly flagged `confident: false` with a specific
  uncertainty note (e.g., "actual volume of containerized debris unknown").
- The structural repair pass genuinely caught and fixed some but not all
  gaps — 4 approved tasks still had zero requirements after the repair
  attempt, and the run correctly reported `stopped` naming them, rather
  than converging falsely. This is the safety net working as designed, the
  same posture already accepted for the Task Agent's orphan handling — not
  a defect to chase down before shipping.
- Corrected the CDL Driver estimate's qty (20 hr → 12 hr) through the
  normal edit UI; confirmed a new `hypothesis`-status semantic memory entry
  was created with the correction as its evidence, and that it renders
  correctly on the Memory Review page (after the source_refs fix above).
- Re-ran the existing mechanical `generateLineItems` pass against the new
  schema — unaffected, produced 16 line items with no error.

## Status

Built against `docs/incoming/task-resource-pipeline.md` (unapproved). This
entry plus `2026-08-28-resource-requirements-foundation.md` document
everywhere the actual build diverges from that doc's literal §2/§4 — most
notably the requirement/line-item split and the confidence+basis fields,
neither of which the doc anticipated in this shape.
