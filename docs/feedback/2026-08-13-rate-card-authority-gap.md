# Rate cards should be the only source of work order pricing — proposed, not built

Not built against an `incoming/` file — surfaced during live testing of Agent Memory Phase 1 and worth capturing before it's lost, but explicitly **not implemented**. Karl wants to think through implications and do more testing before committing to this; this is a design proposal, not a build.

## How this came up
While testing the memory-capture feature, Karl told the agent "we have a company rate for asbestos handling." The agent correctly recognized this as Company-Info-shaped (per `agent-memory.md`'s classification rules) and didn't log a memory proposal for it — but it then offered "Would you like me to note that for you to add to your rate cards, or do you want me to log it as a memory proposal?" That's overclaiming: the agent has no tool that can write to Company Info/rate cards at all (its tool set is only `update_project_component`, `draft_work_order`, `propose_memory_entry`). The phrasing implies capability it doesn't have.

## The deeper gap this exposed
Chasing that thread further: **manual work order line items have never been rate-gated**, at all, independent of Agent Memory. Look at `LineItemForm`'s "manual" mode in `WorkOrderPanel.jsx` — any logged-in user, admin or not, can type an arbitrary rate directly into a real work order line item today. `work-orders.md` deliberately made *generating* a work order not admin-gated ("what's in it is [sensitive], not the generating"), but that reasoning was about who can produce a PDF, not about who has authority to assert a company-wide price. Those two got conflated. Rate cards are the one place `cost`/`rate` figures are meant to be authoritative and admin-controlled (`company-info.md`) — manual line items are a side door around that entirely, and nothing about Agent Memory introduced it, it just made it visible.

## Proposed direction (Karl's call, matches a separate claude.ai conversation he'd already had)
The real job of the project conversation/agent is to **scope work, not price it**. Concretely:
- Rates come *only* from rate cards — no freehand rate entry anywhere, by anyone, admin or not, agent or human.
- A line item the agent or a human adds during scoping either matches an existing rate card entry (resolved, priced from the live catalog) or doesn't (unresolved — name/unit/qty only, no price).
- A work order **cannot be finalized while any line item is unresolved**. Someone with rate-card authority (admin) has to add the missing entry first — that's the actual gate, not a permission check on who clicks "Generate."

## Sketch worked out in conversation (not committed to, just recorded)
- Schema: `work_order_line_items.rate` becomes nullable; unresolved = `rate_card_type IS NULL AND rate IS NULL`.
- Manual line-item UI drops its Rate field entirely — scope-only (name/unit/qty).
- `draft_work_order` agent tool loses its manual-rate fallback the same way — instructed to add unresolved lines and say so, never invent a number.
- `POST /work-orders/:woId/finalize` rejects if any line item is unresolved, naming which ones; "Generate Work Order" button disabled the same way client-side.
- Resolving an unresolved line: admin adds the missing rate card entry via the existing Company Info page, then re-links the line item to it via the existing catalog picker — no new admin surface needed beyond what's already built.

## Open questions Karl flagged, not resolved
"Not sure what other implications there will be" — named but not explored: what happens to work orders already finalized under the old freehand-rate behavior (nothing, presumably — this only changes *new* line items going forward, but worth confirming); whether *any* one-off, never-going-to-be-a-rate-card line should be allowed with an explicit admin override, or whether the rule is meant to be absolute with zero exceptions; whether this should be a global finalize-time gate only or should also block earlier (e.g. warn during scoping, not just at finalize).

## Note on how this got recorded
Karl said he'd ask the agent itself to log this as a memory proposal before moving on to more testing. Flagging for whoever reviews the memory queue: this isn't really procedural or semantic memory as `agent-memory.md` defines them (it's a proposed change to the app's own permission model, not a domain fact or behavioral rule about estimating) — if it shows up there classified as one or the other, that's a reasonable thing to reject from the queue on those grounds specifically, with this feedback file as the actual record instead.
