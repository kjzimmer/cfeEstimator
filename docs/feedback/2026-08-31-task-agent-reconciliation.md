# Task/Dependency Agent gains reconciliation — the same gap the Resource Agent had

Found on a genuinely clean test project ("Fire Debris Removal and Structural
Cleanup, V2", project id 8), not the legacy project with old conversation
history. Karl clicked "Generate Tasks," reviewed the result, told the
Project Agent to add mobilization and the site address, then clicked
"Generate Tasks" again — and the resulting sequence looked wrong ("work at
the site can start before mobilization ends").

## What it looked like vs. what it actually was

Pulled the real data rather than guessing. It looked like a sequencing-
judgment failure. It was actually a duplication bug: the second run
produced **an entirely separate, disconnected chain of near-duplicate
tasks** alongside the first — two tasks literally named "Perimeter ash
scrape," two named "Final site cleanup," two different-but-overlapping
"dust control" tasks, one full chain with mobilization/demobilization
wired through it and one full chain without either. Zero dependency edges
existed between the two chains. What read as "the agent doesn't understand
mobilization has to finish first" was actually two independent task graphs
rendering in the same list, one of which never got mobilization added at
all.

Root cause: the Task Agent had **no reconciliation logic whatsoever**.
Every "Generate Tasks" click started from an empty task map and drafted a
full list with zero awareness that tasks might already exist for this work
order. This is the identical architectural gap the Resource Agent had
before its own reconciliation fix (`2026-08-31-resource-agent-reconciliation.md`)
— it just hadn't surfaced yet because nobody had clicked "Generate Tasks"
twice on the same work order until this test.

Karl's framing, again validated: don't build a special-case fix for "handle
mobilization better" or "handle dust control better" — that's brittle and
breaks on the next slightly-different job. The actual fix is general:
rerunning should reconcile against existing state, the same principle
already applied to the Resource Agent, not a task-specific patch.

## What's built

Mirrors the Resource Agent's reconciliation shape closely:

- Existing tasks (with their current dependencies) are shown to the Task
  Agent as current state to build on in both the draft and sequence
  phases — not overwritten, and not omitted from context. Instructed:
  leave what already exists alone (even if worded differently), only add
  what's genuinely missing.
- Specific instruction for the exact failure mode observed: when a new task
  gets added on top of an existing list (e.g. mobilization after the fact),
  re-check whether *existing* tasks need a new dependency pointing at it —
  not just sequence the new task's own dependencies in isolation.
- Context is rebuilt fresh immediately before *every* phase (draft,
  sequence, orphan-repair) rather than reusing one snapshot across the
  whole run. Same staleness bug already found once for the Resource
  Agent's repair pass turned out to apply here too, for the identical
  reason (same two-phase-plus-repair shape).

Two structural backstops added alongside the reconciliation prompt, not
instead of it — consistent with this pipeline's now-well-established
pattern of not trusting a prompt alone to produce an outcome:
- `taskService.addDependency()` is now idempotent — re-proposing an edge
  that already exists (which a reconciliation pass legitimately will do
  while re-checking) is a silent no-op, not a second identical row.
- A mechanical exact-name duplicate check runs after every generation and
  surfaces any repeated task name for manual merge. Won't catch a reworded
  near-duplicate (needs real judgment, not a string match) — but it would
  have caught 3 of the exact duplicates from this specific incident, and
  costs nothing to run.

## Verification

Reset a test project's tasks, generated once (17 tasks), then reran
generation with **zero new information** — the harshest version of this
test, since there's no legitimate reason for anything to change. Before
this fix, the equivalent production rerun roughly doubled the task count
with disconnected duplicates. After the fix: the rerun added exactly one
legitimate task, zero duplicate names, converged cleanly. Not yet re-tested
against the exact "add mobilization mid-stream" scenario that surfaced the
bug — worth confirming directly next time Karl or the review with CFE
exercises that path again.

## Status

Fifth entry in this series, all against the still-unapproved
`docs/incoming/task-resource-pipeline.md`. The deeper question Karl raised
alongside this (is "dust control" really a discrete sequential task or a
continuous activity spanning other work) remains open and explicitly not
addressed here — agreed with Karl to hold off judging that until it's
retested on a clean, non-duplicated run, since it wasn't clear how much of
the original impression was a real sequencing-judgment gap versus an
artifact of the duplicate chains.
