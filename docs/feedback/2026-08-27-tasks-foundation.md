# Tasks + dependencies foundation — built manual-first

Built against `docs/incoming/task-resource-pipeline.md` §2 (data model) and §5 (human review), but only the manual-entry slice — no Task Agent, Dependency Agent, research step, or Resource Agent yet. This was step 1 of the sequencing agreed in conversation: get the data model and review/edit UX proven against real human-entered tasks before any AI generates them.

## Where this came from
A long design conversation (not captured in any doc until now) preceded this build, working through: task granularity (a "foreman checkpoint" test — would CFE ever need to know "is this specific piece done" as its own milestone, separate from what's on either side of it), what inputs task generation needs (full project context, not just the SOW text field), a real example pulled from `docs/incoming/workOrderExamples/` (two actual CFE estimates for the same address, same job type, different scope) that surfaced a dependency type the original schema didn't have, and a decision to eventually ground task generation in industry-standard references (CSI MasterFormat-style, OSHA/EPA abatement procedure, BMP/erosion-control practices) researched live via Anthropic's web search tool rather than CFE's own inconsistent institutional memory, stored as a new kind of semantic memory. That research/generation piece is the *next* increment, not this one — flagging the full reasoning here so it isn't lost before `task-resource-pipeline.md` gets updated to reflect it.

## Schema deviations from the doc's literal spec, and why
- **Added `responsible_party` (`CFE` | `owner` | `third_party`) to `tasks`.** Not in the original schema. Both real CFE estimates gate mobilization on Owner-obtained permits and third-party regulatory approval ("CFE will not mobilize... until copies of the issued demolition permit and the completed asbestos inspection report have been furnished") — that's a dependency on someone who isn't CFE crew, which the original task_dependencies model (task depends on task, full stop) doesn't distinguish from ordinary crew sequencing. A task CFE is just waiting on behaves differently in review than one CFE controls.
- **Added `source_refs` to `tasks`.** The doc only put this on `work_order_line_items`. Needed so a task can cite what it was instantiated from (a researched industry-standard template, once that exists) the same way a line item already cites its pricing rationale.
- **Added `industry_standard_template` to `tasks.created_via`** (doc had `sow_extraction` | `dependency_gap_fill` | `human_added`) — for the not-yet-built case of a task instantiated from a researched job-type template rather than pulled from this project's own SOW text.
- **Added `human_added` to `task_dependencies.basis`** (doc had `sow_stated` | `domain_sequencing_rule`) — a dependency a person draws manually during review is neither of those.
- **Added `'industry_standard'` to `semantic_memory.origin`** (was `human_asserted` | `agent_inferred`) — for the same not-yet-built research step. Neither a CFE person's assertion nor a pattern inferred from CFE's own project history (CFE doesn't have structured project history to infer from yet), so it gets a distinct value rather than being misfiled as either existing one.

## What shipped, functionally
- `tasks` + `task_dependencies` tables.
- Full manual CRUD: add/edit/delete tasks, add/remove dependencies, with a cycle guard preventing a dependency graph from looping.
- Approval gate (§5.3): bulk `draft` → `approved` across a work order's tasks, not a separate boolean column.
- New **Tasks** tab on the project page, scoped to the current draft work order (tasks require a draft work order to exist first — same dependency Resource Agent work will eventually have on this same foundation).

## A real bug caught by testing the actual failure case, not just the happy path
The cycle guard's graph walk had its direction backwards on the first pass — it would have let a genuinely circular dependency chain through silently. Caught by explicitly testing the exact case it exists to prevent (three tasks, then adding an edge that closes the loop), not by reading the code and assuming it was right. Fixed and reverified afterward: the same case now correctly rejects with a 409, and a legitimate non-circular dependency added right after still succeeds.

## Not built, on purpose
The Task Agent (SOW → draft tasks), the Dependency Agent (sequencing + gap-fill loop), the industry-standard research step and its async/polling handling, and the Resource Agent (tasks → priced line items) are all still ahead. This is the foundation those get built on, not a partial version of any of them.
