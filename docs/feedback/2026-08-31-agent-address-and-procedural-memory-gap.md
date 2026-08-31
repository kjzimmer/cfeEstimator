# No agent had CFE's address, and Task/Resource Agents had no procedural memory at all

Found on the new clean test project, following straight from Karl's two
questions after the reconciliation fix: why did the agent say it doesn't
have the customer's address, and why did he have to manually tell it to
add mobilization rather than the agent figuring that out itself.

## What was actually missing, checked directly rather than assumed

Two distinct, unrelated gaps that happened to produce the same symptom:

1. **CFE's own address was never queried by any agent.** It lives in
   `company_identity.address` (a real, populated field — confirmed
   locally: "4820 Quarry Road, Golden, CO 80403"). Nothing in
   `agentService.js`, `taskGenerationService.js`, or `resourceAgentService.js`
   ever fetched it. Only the freeform `company_info_sections` (Products &
   Services, Employee Base) reach any agent's context, and neither of
   those happens to contain the address.
2. **The customer's address was dropped at the query level.** The shared
   `SELECT_WITH_CUSTOMER` query in `projectService.js` only ever joined
   `c.name AS customer_name` — never the customer's `address` column, even
   though it's a real, populated field on the customer record. Confirmed:
   a project with a real customer on file was already missing this before
   it ever reached the Project Agent, let alone the Task/Resource Agents.

Between the two, an **existing seeded procedural rule** — *"Don't ask for
distance from CFE to the project site if it can be derived from the
project location and company location -- derive it instead"* — was never
actually satisfiable by anything in this system. Both halves of that
derivation were structurally absent. This is what was actually behind the
agent saying it lacked the customer's address and needing Karl to supply
mobilization distance by hand — not a reasoning failure, a missing-input
problem.

A related, independently-confirmed gap: **neither the Task Agent nor the
Resource Agent had access to procedural memory at all** — only the Project
Agent did (`buildMemoryContext()` in `agentService.js`). So even a company
convention that *is* captured and active would never reach the agent
actually generating tasks or estimating resources.

## Why this isn't "add a mobilization rule"

Karl was explicit about not wanting a hard-coded rule forcing mobilization
into every task list — that would remove the agent's ability to correctly
decide it *isn't* needed for a job where it genuinely doesn't apply (e.g. a
site CFE is already staffed at). The general fix, consistent with
everything else in this pipeline: give every agent the same standing
context and company-convention access, and let *teaching* — via the
existing `propose_memory_entry` conversational path, already built for
exactly this — populate the actual conventions. If "always break out
mobilization/demobilization as distinct tasks when travel is involved" is
a real CFE pattern, that's a procedural memory entry a human states once;
from then on every agent that consults procedural memory (now including
Task and Resource) applies it with judgment, not as a rigid rule baked
into code.

## What's built

- `projectService.js`'s shared query now joins `customer_address` alongside
  `customer_name` -- available everywhere a project is fetched, not just
  agent contexts.
- `taskGenerationService.buildProjectContext` (shared by Task and Resource
  Agents) now includes CFE's address, the customer's address, and active
  procedural memory, with an explicit note that the customer's address is
  usually the work site for these jobs unless the project's own `location`
  component says otherwise.
- `agentService.js`'s Project Agent prompt gains the same two address
  sections, for consistency across all three agents.

## Verification

Confirmed directly, not just read from the diff: `buildProjectContext`
against a real project now surfaces CFE's actual address and the exact
seeded "derive distance" procedural rule text; `projectService.getProject`
against a project with a real customer now returns a populated
`customer_address`. Not yet re-tested against a live "does the agent now
correctly derive mobilization distance without being told" run — worth
confirming next time Karl generates tasks on a fresh project.

## Explicitly deferred, discussed but not built

Karl raised a good related idea mid-fix: a structured "project address"
field (or a same-as-customer toggle), rather than relying on the freeform
`location` definition component and the customer's on-file address to
implicitly agree. Agreed to hold this as its own follow-up rather than
fold it into this fix — it's a real design decision (where it lives, how
it interacts with the existing `location` component, what the UI looks
like) that deserves dedicated attention, not something to bolt on while
fixing a context-wiring gap.

## Status

Sixth entry in this series, same unapproved `docs/incoming/task-resource-pipeline.md`
this whole series has built against.
