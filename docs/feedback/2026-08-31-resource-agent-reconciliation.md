# Resource Agent reconciliation on rerun, and two real bugs found testing it

Follow-on to `2026-08-30-resource-agent.md`, driven by two rounds of Karl
testing on a real production project ("Fire Debris Removal and Structural
Cleanup") and a design conversation that reframed how reruns should work.

## What changed and why

Karl's framing: rerunning the Resource Agent is a common, expected event
(new information comes in, a task changes) — not a from-scratch operation.
Existing reasoning is the current state to build on: keep what still holds,
revise what new information changes, and give real deference to anything a
human has already reasoned through. The prior implementation didn't do this
at all — it had no awareness of existing requirements and would have
blindly duplicated on a second run.

Built:
- **`human_reviewed` column** (new) — set only by a human editing a
  requirement (`resourceRequirementService.updateRequirement`), never by the
  agent revising its own prior estimate. This is the signal the agent uses
  to tell "a human already weighed in here" from "this is still my own
  original guess" — deliberately never auto-reset, since "a human reviewed
  this at some point" stays true as project history even if the value
  changes again later.
- The estimate phase's context now lists each task's *existing*
  requirements (id, current values, current rationale, human-reviewed flag),
  not just the task name. A new `update_resource_requirement` tool lets the
  agent revise a specific one; leaving it untouched (no tool call) is the
  correct action when it still holds — the prompt says this explicitly,
  since "do nothing" being correct is not the default assumption a tool-
  calling loop makes on its own.
- `reviseGeneratedRequirement()` — a separate agent-facing revision path
  from the human-facing `updateRequirement()`. Deliberately doesn't set
  `human_reviewed` and doesn't trigger `recordResourceCorrection`'s evidence
  capture, since an agent revising itself isn't a human teaching it
  anything — conflating the two would corrupt the semantic memory evidence
  trail with self-generated "evidence."

## Two real bugs found via live testing, not code review

**1. The circular work-order-as-input bug** (found by Karl reading the
actual rationale text on a real project, not by testing in the abstract):
rationale was citing an existing work order's line items back as
justification ("work order includes $350 for water tank/delivery"), traced
to `buildProjectContext`'s "full conversation thread" containing the
Project Agent's own past narration of manually drafting that same work
order. Fixed by giving `buildProjectContext` an `includeConversation` flag
(default true, so the Task Agent is unaffected) and having the Resource
Agent pass `false`, relying on `project.definition` alone. Same root cause
also produced three material requirements with `qty 1 / unit "job"` and no
basis at all — the agent copied the old lump-sum framing instead of
reasoning out a real quantity. Also hardened: a denylist rejects vague
placeholder units ("job", "misc", "lump sum" spellings) at the tool-call
level, not just discouraged in the prompt.

**2. Rationale-must-show-reasoning, applied to evidence capture too**
(Karl's follow-up insight): a number is never its own rationale — the
reasoning behind it is what's worth carrying forward. This exposed that
`recordResourceCorrection` only captured before/after *values* on a human
correction, dropping the stated reasoning entirely — the exact same failure
mode as citing a bare old work-order figure, just one step removed. Fixed:
evidence now includes rationale, and the resulting semantic memory
hypothesis's `content` *is* the human's stated reasoning when they gave one,
with an honestly-labeled fallback ("without stating a reason -- the
corrected value alone isn't a confirmed tendency") when they didn't.

**3. Repair-phase duplication** (found while verifying the reconciliation
feature above, not reported by Karl): the repair pass — which fills in any
task the main estimate pass skipped — was reusing the system prompt built
*before* the main pass ran. Its "existing requirements" listing was a
snapshot from before that pass wrote anything, so it still showed "(none
yet)" for a task the main pass had *just* covered moments earlier in the
same run, and the model dutifully added a second, redundant set of
requirements for it. Fixed by rebuilding context fresh from the database
before constructing the repair prompt, rather than reusing a snapshot that
goes stale mid-run. This is the same class of bug as the Task Agent's
orphan-task issue from earlier in the project — a stale or unverified
assumption about what's already true, not model unreliability per se.

## Verification

All three fixes and the reconciliation feature verified directly against
real DB state, not just read from code:
- Confirmed the circular-citation and vague-unit fixes by clearing flawed
  production data and having Karl regenerate.
- Confirmed rationale-in-evidence by exercising both paths directly: a
  correction with real stated reasoning produces a hypothesis whose content
  *is* that reasoning; a correction with none produces the honest fallback.
- Confirmed reconciliation end-to-end on a real project's data: corrected
  one requirement (making it human-reviewed), reran, and the corrected
  entry came back byte-for-byte unchanged while newly-covered tasks got
  real requirements added. A full duplicate-pair scan across the work order
  came back empty *after* the repair-phase fix, on the same data where it
  had found six duplicate pairs *before* the fix — confirming the fix
  actually closed the gap it was meant to, not just that no duplicates
  happened to appear this time.
- Also observed, unprompted, that a semantic memory hypothesis created from
  an earlier correction (see `2026-08-30-resource-agent.md`) was correctly
  reused across four separate permit-related tasks in a fresh run, each
  citing it by id — the teaching loop compounding as intended, not just
  working for the single case it was tested on.

## Status

Built against `docs/incoming/task-resource-pipeline.md` (unapproved), same
as the two prior entries in this series. The reconciliation behavior here
is new scope beyond anything that doc anticipated — worth folding in if/when
that doc gets formalized.
