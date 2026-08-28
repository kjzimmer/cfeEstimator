# Task/dependency graph — discussion for the next version, not built

Two related design conversations from this session, deliberately left as discussion only — Karl wants to close out the current version's new functionality rather than keep expanding scope, but wants both captured clearly since he intends to address them "probably the next version."

## 1. Start/End milestones -- a real gap in the current orphan check, not just a nice-to-have

Found while reviewing the orphan-repair fix (see `2026-08-27-tasks-foundation.md` and the rate-authority/tasks feedback trail): the current `findOrphanTasks()` check (in `taskGenerationService.js`) only catches a task with **zero dependency edges in both directions simultaneously**. Karl's framing is sharper than that:

- A task that legitimately begins at project start has no *prior* task, but should still have at least one *follow-on* task -- if it has neither, that's not "initial," that's disconnected.
- A task that legitimately ends the project has no *follow-on* task, but should still have at least one *prior* task -- same asymmetry, opposite direction.

The current check misses a task with edges missing in *just one* direction -- that passes silently today with no signal about whether it's a legitimate start/end point or an actual sequencing gap.

**Proposed resolution, discussed but not built:** add explicit single Start and End milestone nodes to every generated task graph. This isn't a novel idea -- it's standard PERT/CPM network-diagram convention specifically for this reason. With them in place, the validation rule stops being fuzzy: *every* real task must have at least one incoming edge (from Start or a prior task) and at least one outgoing edge (to End or a later task), no exceptions to reason about.

**Open sub-question Karl raised, also unresolved:** is a milestone a flagged/typed row in the existing `tasks` table (e.g. `is_milestone` or `type`), or a genuinely separate concept/table? Discussed and leaning toward **flagged task, not a separate concept** for now:
- Matches how real scheduling tools already do it (MS Project et al. represent a milestone as a task with zero duration, not a different entity type) -- established precedent, not a shortcut.
- Reuses everything already built and tested: the `tasks` table, `task_dependencies` edges, the cycle guard, the manual UI, the generation tools.
- The one real difference a milestone has -- it shouldn't get resources/pricing assigned -- is a cheap filter for the future Resource Agent (`WHERE NOT is_milestone`), not a reason to fork the data model now.
- Revisit if building the Resource Agent makes milestones-as-tasks genuinely awkward in practice -- that's the concrete trigger worth waiting for, not something to design around speculatively today.

## 2. Network diagram rendering -- validated as a real Phase 4 item, not scope creep

Karl asked whether the task list + dependencies could drive a visual network diagram, both for its own sake (dependencies are hard to read as a flat list) and as a lead-in to broader project-management functionality CFE/Valor wants. Worth noting: `task-resource-pipeline.md` already names this exact thing under "Not this phase" -- "Rendering the dependency graph as a Gantt/PD... Phase 4" -- so this isn't new scope, it's naming the moment to actually build a phase that was already planned.

No new data modeling needed -- `tasks` (nodes) + `task_dependencies` (edges) already is a directed graph. Discussed as a three-step progression, not one build:
1. **Simplest**: a topological "layering" pass (tasks with no predecessors at layer 0, their dependents at layer 1, etc. -- a standard, cheap algorithm) rendered read-only, possibly starting with something like Mermaid flowchart syntax for speed.
2. **Next**: a proper custom SVG/canvas layout with pan/zoom, click-to-see-detail, visual distinction for `confident: false` edges and `responsible_party`.
3. **Most ambitious**: a fully interactive diagram (drag to rearrange, live updates, eventually critical-path highlighting once durations/resources exist). Karl has built this kind of thing before in native JS -- real prior experience to draw on here, not a from-scratch research problem.

Flagged as a genuine fork point for product direction, not just a UI addition -- a good dependency visualization is typically the gateway to a full Gantt/scheduling capability, which is a materially bigger product scope than anything built so far.

## Status
Both discussed and left as conclusions to revisit, not implemented. Current version's task/dependency work is considered close to done pending natural-use observation of the orphan-repair fix (see prior feedback entry) -- these two items are explicitly next-version material.
