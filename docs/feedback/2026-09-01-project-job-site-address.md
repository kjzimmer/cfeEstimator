# Structured job site address (separate from customer billing address)

Built same session as `2026-09-01-generalized-teaching-loop.md` and
`2026-09-01-conditioning-worktiming-symmetry.md`, prompted by Karl reviewing
those closeout fixes: the address/distance work in
`2026-08-31-agent-address-and-procedural-memory-gap.md` had wired every agent
up to use the *customer's* address for distance/mobilization reasoning,
with a caveat baked into the prompt text ("usually the work site... unless
the project definition's own 'location' component states a different
site"). That caveat relied on an agent noticing a freeform narrative
override -- exactly the "prompt instruction without a structural backstop"
pattern this pipeline has repeatedly found insufficient elsewhere. Karl
flagged it as a real, immediate need (not the deferred "project address"
idea noted in that earlier doc) once he thought through what happens when a
customer's billing address and job site genuinely differ.

## What changed

- **Schema**: `projects` gains `job_site_same_as_customer` (boolean, default
  true) and `job_site_address` (text, only meaningful when the flag is
  false).
- **Resolution, in one place**: `projectService`'s shared
  `SELECT_WITH_CUSTOMER` now computes `resolved_job_site_address` via a SQL
  `CASE` (customer's address when the flag is true, the override otherwise).
  Every caller -- Task Agent, Resource Agent, Project Agent, the work order
  PDF -- reads this one resolved field now, not `customer_address` directly.
  Centralizing the fallback here means no caller re-implements it or (as
  before) has to infer an override from prose.
- **New "Details" tab** (`ProjectDetailsPanel.jsx`, first tab in
  `ProjectPage.jsx`): edits name, customer, and status, plus a same-as-
  customer / different-job-site radio toggle with an address field. This is
  the first place a project's own name/customer/status can be edited after
  creation at all -- previously that only happened once, in the creation
  form.
- **New route**: `PUT /api/projects/:id` (full-replace, same convention as
  `customerService.updateCustomer`/its route) -- distinct from the existing
  `PUT /:id/definition/:componentKey`, which is the agent-filled freeform
  blob, not the project's own record.
- Removed the "unless location states otherwise" hedge from both the
  Task/Resource Agent context builder (`taskGenerationService.
  buildProjectContext`) and the Project Agent's system prompt
  (`agentService.js`) -- the job site address is now a structural fact, not
  something the model needs to infer from narrative.

## What didn't change

`definition.location` (the freeform, conversationally-built narrative
component) still exists and still gets filled in by the Project Agent --
it's just no longer treated as an address override mechanism. It's for
richer site-visit narrative (access notes, terrain, obstacles), which is a
different job than "what's the address for a distance calculation."

Also explicitly not built now, per Karl's own scoping: an initial job
description field on this tab, or any other new Details-tab field beyond
name/customer/status/job-site. Both mentioned as "maybe later," not part of
this pass.

## Verified

- Local Postgres migration applied cleanly (`ALTER TABLE ... ADD COLUMN IF
  NOT EXISTS`, safe on the existing dev DB).
- Direct API test: toggling a real project (`Benfatti Fire Debris Removal`)
  to a different job site address and back confirmed `resolved_job_site_
  address` follows the flag correctly in both directions, including the
  case where the project has no customer at all (resolves to `null` when
  same-as-customer is true and there's no customer address to fall back to).
- Live browser test (Playwright, local dev server): opened the new Details
  tab, switched to "Different job site," entered an address, saved, reloaded
  the page, and confirmed the value persisted. Zero console errors during
  the interaction. Reverted the test project back to same-as-customer
  afterward to leave local dev data clean.

## Status

Done. Built against the same still-unapproved `docs/incoming/task-resource-
pipeline.md` and general project conventions (no dedicated incoming doc for
this one -- it's a schema/UX gap fix on the existing project record, not new
pipeline behavior). Karl's plan: run a fresh clean project test next, now
covering address-aware estimation with a *real* job-site/customer distinction
available for the first time, ahead of a demo for CFE's owner.
