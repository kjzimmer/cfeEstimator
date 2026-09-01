# Reconciliation gaps found on rerun, plus a full-reload mode

Same testing thread as `2026-09-01-resource-agent-taskname-parsing.md`
(Fire Debris Removal V4, work order 13) -- Karl reran Generate Resource
Requirements after that fix deployed and found two further problems, both
confirmed from the run's own data rather than guessed at.

## Two reconciliation gaps found

1. **Leftover "Unresolved" placeholders never get cleared.** The
   reconciliation prompt's guidance ("if an existing requirement still
   holds, leave it alone") never distinguished a real requirement from the
   agent's own "Unresolved -- needs input" placeholder. The model found real
   resources for several previously-flagged tasks this run, but called
   `add_resource_requirement` (new rows) instead of `update_resource_
   requirement` on the placeholder's own id -- leaving dead placeholder rows
   sitting next to the new real ones. Fixed with an explicit prompt
   instruction: a placeholder is not a decision to defer to, revise it in
   place when it can now be resolved.

2. **The "did every task get covered" check was defeated by its own
   placeholder.** `findTasksMissingRequirements()` only checked "does this
   task have any requirement row at all" -- which a leftover placeholder
   already satisfies. Two tasks (a newly-added concurrent containment task
   and demobilization) got zero attention whatsoever this run -- not an
   error, not a flag, nothing -- because the code believed they were already
   covered from the *previous*, bug-afflicted run. The run reported
   `converged` despite this. Fixed the query to only count a task as covered
   if it has at least one requirement that isn't the placeholder.

## The bigger question this surfaced

Karl's read, after seeing both of these: the reconciliation prompt's whole
framing -- "review each existing row, leave it alone if it still holds" --
is weaker than it should be. It anchors on existing rows and asks "does this
still seem OK," which invites exactly the kind of pass-through skimming that
produced both bugs above. His proposed principle: **existence is never its
own rationale for retention** -- extending this pipeline's existing "a
number is never its own rationale" rule one step further, to apply to
human-entered resources too, not just agent ones. The only legitimate reason
to keep an existing resource is that a genuine, complete re-derivation of
the task's needs independently lands on it.

Agreed this is right, and that it implies two genuinely different
operations that shouldn't be handled by one mode:
- **Full reload**: discard everything for the scope and regenerate clean.
- **Revision**: derive the complete resource set fresh, then reconcile
  against existing state -- keep what matches, revise/remove what doesn't,
  add what's missing. Not yet built; the reconciliation prompt still just
  reviews existing rows for continued validity rather than doing a fresh,
  independent derivation to reconcile against.

Karl's call: build full reload now and use it during dev to get a clean
baseline for assessing the agent's raw judgment, without reconciliation
behavior in the way. Revision is real work for a later pass, once the
clean-slate path is trusted. He also flagged this same full-reload-vs-
revise tension applies to all three AI-driven stages (Task/Dependency,
Resource) -- worth keeping in mind if/when the Task Agent gets a similar
mode, though only Resource Requirements got one today.

## Built

- `resourceRequirementService.deleteAllForWorkOrder(workOrderId)` -- deletes
  every requirement for a work order, including human-reviewed ones. Plain
  delete, no soft-delete/undo -- this is explicitly meant to be destructive.
- `resourceAgentService.startGeneration`/`executeGeneration` take an
  optional `fullReload` flag; when true, deletes first, then runs the exact
  same code path as a task with zero prior requirements (no new estimation
  logic needed -- the "(none yet)" branch was already correct).
- Route: `POST .../resource-requirements/generate` accepts `{ fullReload }`
  in the body, default false.
- UI: a secondary "Reload all from scratch" action next to the normal
  Generate Resource Requirements button (only shown once requirements
  exist), gated behind a confirm dialog since it's destructive and discards
  human-reviewed history unconditionally.

## Status

Both reconciliation-gap fixes and the full-reload feature built, `node
--check` and a client build both pass. Not yet deployed or re-verified live
-- Karl's plan is to use full reload during dev now to get a clean baseline,
then decide when to tackle the harder revision-mode redesign.
