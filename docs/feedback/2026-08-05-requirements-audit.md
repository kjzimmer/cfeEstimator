# Full requirements audit — deviations, gaps, and implementation notes

Not built against a specific `docs/incoming/` file — this is a requested audit: read every `requirements/*.md` doc plus the current server/client code end to end, and write down every place they diverge, plus implementation choices that didn't work and why (in the spirit of `2026-08-05-pdf-preview-mobile-fix.md`). Organized by area. New findings first in each section; previously-flagged items are restated (not re-litigated) so this doc is a single place to check, and linked back to their origin session note.

## New findings from this pass

### 1. Definition Panel is read-only — no human override path (`agent-sidebar.md` / `api-architecture.md`)
`api-architecture.md`'s minimum API surface calls for "update definition component," and it exists end-to-end — `PUT /api/projects/:id/definition/:componentKey` server-side, `api.updateDefinitionComponent()` client-side — but nothing in the UI ever calls it. `DefinitionPanel.jsx` only renders the definition; it has no edit affordance. Today the *only* way to change a definition component is to get the agent to rewrite it via chat.

Not a spec violation — neither doc requires a manual-edit UI, and this phase's explicit stance is "default to autonomous [agent] writes." But it's a real gap: if the agent gets a component wrong during a demo, there's no direct fix, only "tell the agent to correct it and hope it listens." Worth deciding whether a lightweight manual-edit affordance is worth building before this is used outside a demo.

### 2. Agent tool-loop cap could theoretically produce a blank "(no response)" reply (`agentService.js`)
`runAgentTurn`'s tool-calling loop (`server/src/agent/agentService.js:204`) caps at 6 rounds. Each round captures `finalText` from that round's *text* blocks before executing that round's tool calls. If the model needs a 7th round (e.g., a large site-visit note that touches many definition components and drafts a work order in one go) and its 6th response is pure `tool_use` with no accompanying text, the loop ends without ever asking the model for a closing summary — the user sees "(no response)" in chat even though real work happened server-side (components updated, draft revised).

I have not reproduced this — the system prompt already nudges the model to keep chat replies short and conversational alongside tool calls, which makes a text-less final round unlikely in practice, not impossible. Flagging as an edge case worth a quick manual test with a deliberately large, multi-fact input (e.g., a long dictated site visit) rather than a confirmed bug.

### 3. Stale comment in `projectService.js`
`server/src/services/projectService.js:4-5` says the customer-name join exists "the Customers CRUD UI (docs/requirements/customers.md) isn't built yet." That UI shipped two sessions ago (`2026-07-30-company-info-restructure-and-customers.md`). Harmless — it's just a comment — but worth a cleanup pass so a future reader (human or Claude Code) isn't misled about what's built.

### 4. Inconsistent cost-omission style for non-admins
Rate-card item routes (`companyInfoRoutes.js`) strip `cost` via `{ cost, ...rest }` destructuring. Work-order line-item POST/PUT routes (`projectRoutes.js:220,237`) instead set `cost: undefined` on the response object. Both are equally effective (`JSON.stringify` drops `undefined` keys, so `cost` never reaches a non-admin either way) but it's an inconsistent pattern in code that specifically exists to enforce a security-relevant guarantee — worth normalizing to one idiom if this code gets touched again, so there's only one pattern to audit for correctness.

## Still-open items from prior sessions (consolidated, not new)

These were already flagged in earlier feedback files and remain unresolved as of this audit — restating here so there's one place to see everything outstanding, not because anything changed:

- **`api-architecture.md`'s "minimum API surface" list still doesn't mention Customers.** Flagged in `2026-07-29-rate-cards-and-customers-prep.md` and again in `2026-07-30-company-info-restructure-and-customers.md`. Two sessions later, still stale — probably just needs a human/DevOps pass to add the Customer endpoints to that list.
- **`requireAdmin` doesn't recheck `is_active` mid-token-lifetime.** A deactivated user's existing JWT (up to 12h TTL) keeps working until it expires. From `2026-07-29-admin-roles.md`. Acceptable for a prototype; would need session invalidation or a shorter TTL to close for real.
- **Stray production project**: "Willow Creek Pole Barn 2" / customer "Billy Bob" — flagged in `2026-07-29-rate-cards-and-customers-prep.md` as an unlinked, duplicate-looking project not part of any real build, left untouched. Still there as far as I know; worth a manual delete if confirmed as test debris.
- **Agent's rate-card context omits `cost`.** `work-orders.md` explicitly *allows* the agent cost access for internal estimating (while still barring cost from customer-facing output), but `agentService.js`'s `buildRateCardContext()` only sends `rate`. Deliberately deferred in `2026-07-30-work-orders.md` to keep that build's surface smaller — the agent currently can't reason about margins in chat even though the doc permits it.
- **PDF viewer mobile rendering** — fully covered in its own note, `2026-08-05-pdf-preview-mobile-fix.md`; not restating the detail here, just cross-referencing so this audit doesn't read as if it were missed.

## Areas checked with no new findings
Auth (`auth.md`), Customers CRUD (`customers.md`), Projects core (`projects.md`), Project Documents (`project-documents.md`), and Company Info structured/freeform split (`company-info.md`) all matched their specs on this pass — access gating (server *and* client), the rate/cost visibility split, the JSON-blob project definition, and the file `type`/`source` model all lined up with what's written. No deviations found beyond what's listed above.
