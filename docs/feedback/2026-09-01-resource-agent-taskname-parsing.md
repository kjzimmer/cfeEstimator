# Resource Agent: task-name/description parsing bug found via live production test

Found while Karl ran a clean project test (Fire Debris Removal V4, work order
13) exercising a manually-added "concurrent containment" task. Initial guess
was that the new task conceptually confused the model -- the actual cause,
confirmed from the run's own dev-mode round trace, was unrelated to that
task specifically.

## What actually happened

Round 0 of the estimate phase failed **every single `add_resource_requirement`
call** with "Unknown task name." The model had copied the task list's whole
displayed line -- name, colon, and description together (e.g. `Mobilize
equipment and crew to site: Transport excavator, trucks, and crew from
Silver Cliff to Rye site (approx. 90 miles one-way)`) -- into `taskName`,
instead of just the name. `taskByName` is keyed on the exact name only, so
every lookup missed.

This wasn't new-task-specific: the task list is rendered as one line per
task (`- ${name}${description ? ': ' + description : ''}`), and this
project's task descriptions happen to be unusually long and detailed this
run. The Task/Dependency Agent uses an identical one-line format but has
never shown this failure, because it only ever echoes back names *it just
typed itself* (in `add_dependency`) -- it never has to re-parse a name back
out of a rendered block the way the Resource Agent does for tasks it didn't
create. Confirmed this really is the mechanism, not a guess: the very next
round (after receiving nine straight "Unknown task name" tool-result errors)
used bare names correctly, but by then a whole round of the estimate
phase's budget was already spent on nothing.

A second, apparently unrelated failure in the following repair-missing
round compounded it: one `add_resource_requirement` call arrived missing
`description`/`qty`/`unit`/`rationale` entirely, tripping a NOT NULL
constraint. Best explanation, not fully confirmed: `max_tokens: 2048` per
round is tight for a batch of several calls each carrying a full,
reviewer-checkable rationale string (a standing requirement from
`2026-08-31-resource-agent-reconciliation.md` era), and this looks like the
model's own output got cut off mid-call.

Together these burned enough of the round budget that most of the task list
(6 of 10 approved tasks, including the new containment task) never got a
real attempt and fell through to the structural "flag unresolved" fallback
-- which is worth noting worked exactly as designed: nothing was silently
dropped, it was just triggered by an upstream mechanical failure rather than
genuine estimating uncertainty.

## Fixes

1. **Task list display format** (`gatherContext`'s `taskListText`): name and
   description are now on separate lines (`Task: "..."` / `Description:
   ...`) instead of one run-on `name: description` line. Added an explicit
   instruction in the prompt and in both `add_resource_requirement` and
   `flag_unresolved_resource`'s `taskName` schema description: exact name
   only, never the description text.
2. **Structural backstop, not just the prompt fix** (per this pipeline's
   established practice): a new `resolveTask()` helper tries an exact match
   first, then falls back to matching on the text before a `:` or `--`
   separator if the model still echoes back a compound string. Applied to
   both tool handlers that look up a task by name.
3. **Raised the Resource Agent's per-round `max_tokens` from 2048 to 4096**
   -- addresses the likely-truncation-driven malformed call. Scoped to this
   agent only; the Task/Dependency Agent's calls are much shorter (no
   rationale-heavy resource payloads) and haven't shown this failure mode.

## Status

Built, `node --check` passed. Not yet re-verified live against the same
production work order (13) -- Karl's plan is to rerun Generate Resource
Requirements on it once deployed. Update this doc (or file a new one) once
that rerun confirms the fix, per the standing rule in this pipeline: a fix
isn't done until it's been watched work on a real run, not just reasoned
through.
