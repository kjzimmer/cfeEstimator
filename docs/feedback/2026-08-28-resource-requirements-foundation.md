# Resource requirements — manual foundation + mechanical line-item generation

Built against `docs/incoming/task-resource-pipeline.md` §4, with one deliberate
schema deviation from that doc's literal design, per Karl's direction. Same
two-step rhythm as the Task/Dependency Agent work: manual data model + UI
first (this entry), AI estimation loop next.

## What changed from §4's literal design, and why

§4 goes straight from a converged task to a grouped, rate-card-matched line
item in one step — the Resource Agent both decides what a task needs *and*
groups/prices it in the same motion. Karl's framing splits that in two, and
was explicit that the split matters: **determining what a task needs (labor
hours, material, equipment, "probably other resources I've missed") using
general construction knowledge plus CFE-specific tendencies — proactively
sought out, not just used if already on hand — is the hard part.** Turning
matching requirements across tasks into a costed line item is, in his words,
"the very last and very algorithmic part of the process."

That split is now a real schema boundary, not just a phrasing choice:

- **New table `task_resource_requirements`** — one row per task per resource
  it needs (`resource_type`: labor/material/equipment/other, `description`,
  `qty`, `unit`, `rationale`, `source_refs`). This is the persisted output of
  the judgment step. `source_refs` reuses the same vocabulary tasks already
  use (`semantic_memory_hypothesis`, etc.) so a requirement can cite an
  existing CFE-specific tendency once one exists in semantic memory — sets up
  the "proactively seek out CFE-specific tendencies" loop Karl wants without
  needing a new citation type.
- **`resourceRequirementService.generateLineItems()`** — the mechanical last
  step, and genuinely just that: groups requirements across tasks by exact
  match on `(resource_type, description, unit)`, sums qty, resolves against
  the matching rate card by name (same `findItemByName` + no-freehand-rate
  rule every other line item already follows), writes `work_order_line_items`,
  links contributing tasks via the new `work_order_line_item_tasks` join
  table. No AI call in this function at all — matches "very algorithmic"
  literally, not just in spirit.

One consequence worth flagging: because grouping is exact-string-match, not
fuzzy, the burden of writing a *consistent* resource description across tasks
that really do share one resource falls on whoever populates the
requirements — today that's a human typing it by hand, later it'll be the
Resource Agent's job to reuse the same description when it recognizes reuse.
The mechanical step deliberately does no normalization/fuzzy-matching beyond
case/whitespace, on the theory that "same resource, described consistently"
is squarely a reasoning problem, not something worth guessing at mechanically.

## What's built (this entry)

- Schema: `task_resource_requirements`, `work_order_line_item_tasks`.
- `resourceRequirementService.js`: manual CRUD (`human_added` only, same
  posture as tasks before the generation loop landed) + `generateLineItems`.
- Routes + client API wiring, admin-gating matched to Tasks' existing posture
  (not gated — scoping isn't the sensitive action).
- UI: each task row in the Tasks tab now has an add/remove resource
  requirement list (same lighter-weight pattern as the dependency picker —
  no inline edit, add or remove only). A "Generate Line Items" action appears
  once the task list is fully approved, mirroring the existing approval-gates-
  costing posture from §5.3/§1.

## Verification

Ran end-to-end in a real headless browser (not just code review) against the
Benfatti Fire Debris Removal project's real generated task list:
- Added a requirement with no matching rate-card entry ("Excavator w/
  hydraulic thumb, 320-class, w/ operator", 8 hr) — generated line item
  correctly showed `unresolved`, rate `—`, amount `$0.00`.
- Added a requirement matching an existing Equipment Rate Card entry exactly
  ("Skid Steer", 2 day) — generated line item correctly resolved to
  $380.00/day, $760.00 amount, and rolled into the work order's subtotal/total.
- Re-ran generation after adding the second requirement — confirmed it
  replaced rather than duplicated the first line item.
- No console errors either run.

## Not built yet (next)

The actual Resource Agent — the AI loop that estimates labor/material/
equipment/other requirements per task using general construction knowledge,
checks semantic memory for CFE-specific tendencies, and proactively forms a
research/hypothesis step when none exists yet (same "research inline during
generation" pattern already established for the Task Agent's industry-
standard templates). This foundation is what that loop will write into,
exactly the same relationship the manual Task/Dependency CRUD had to the
Task/Dependency Agent before that loop was built.

## Status

Built against `docs/incoming/task-resource-pipeline.md` (not yet approved/
moved to `docs/requirements/`) — this entry documents where the actual build
diverges from that doc's literal §4/§2 schema, per the working agreement, so
whoever finalizes that doc can reconcile the two rather than treating the
doc's literal join-table sketch as ground truth.
