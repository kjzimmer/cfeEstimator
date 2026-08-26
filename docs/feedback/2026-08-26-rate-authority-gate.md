# Rate-card authority gate — built

Built against `docs/incoming/task-resource-pipeline.md` §1 (work order lifecycle), §4 (rate rules), and §6 (manual line entry) — the first slice of the sequenced Task/Dependency/Resource pipeline work, per the build order agreed in conversation. Tasks, dependencies, and the Resource Agent itself are not built — this is only the rate-authority foundation those steps sit on top of.

## What shipped
- `work_order_line_items.rate` is nullable. A line resolves against a rate card (rate/cost pulled live) or stays unresolved (name/unit/qty only, `rate`/`cost` both null) — never a third state where someone typed a number in directly.
- `resolveLine()` (shared by add and edit) unconditionally sets `rate: null` for any line without a `rateCardType` — there's no code path left that accepts a client-supplied rate, for anyone.
- Finalize checks every line item is resolved before generating anything; blocks with a 409 naming the unresolved items if not. Unresolved is fully fine during drafting — the block is finalize-only, per the already-resolved open question.
- The agent's `draft_work_order` tool lost its manual-rate fallback entirely. It's instructed to match by exact name against the live catalog (never a "close enough" substitute) and add unmatched resources unresolved, saying so in its reply.
- `WorkOrderPanel`: manual entry ("Scope only" now, renamed from "Manual") has no Rate field; unresolved lines show "—" and an amber "unresolved" badge instead of `$0.00`; "Generate Work Order" is disabled with a message naming what's blocking it.

## A design decision made while building: editing a resolved line re-resolves it
`updateLineItem` now shares `resolveLine()` with `addLineItem` instead of taking a raw `rate` field. Editing a resolved line's qty re-passes its own `rateCardType`/name and re-resolves against the live rate card — meaning editing a line item's quantity also picks up any rate change since it was added, rather than freezing the price at add-time. Wasn't explicitly speced either way; picked this because freezing stale prices silently seemed like the wrong default given the whole point of this feature is rate cards being the current source of truth.

## Verified live, full loop
- Added an unresolved line, confirmed finalize returns 409 naming it.
- Deleted it, added the same resource via the rate card catalog, confirmed it resolved with the live rate.
- Edited that resolved line's qty (3 → 5), confirmed it re-resolved (rate stayed correct, amount recalculated) rather than erroring or losing its rate-card link.
- Finalized successfully once resolved.
- Asked the agent to draft a work order with one catalog-matched resource and one deliberately unmatched one ("underwater drone survey work") — it priced the matched one correctly, added the other unresolved, invented no number, and told the human it needs a rate card entry before finalizing.

## Known rough edge, not fixed
There's no in-place "link this unresolved line to a rate card entry" action — resolving one today means deleting it and re-adding the same resource via the catalog picker (which already exists and works). Loses `sort_order` placement. Acceptable for now; flagging in case it's annoying enough in practice to warrant a proper "resolve" action later.

## Noticed, not fixed (pre-existing, unrelated to this change)
`DraftEditor`'s `onAdded`/`onUpdated` handlers splice a single returned line item into the client's `workOrder` state without refetching `subtotal`/`contingencyAmount`/`total` from the server — so those figures can go stale in the UI after adding/editing a line until something else triggers a full reload. Pre-existing behavior, not something this change touched or introduced; didn't fix it since it's out of scope for the rate-authority work, but worth a look separately since it's a real display bug.

## Docs needing a human/DevOps update
`task-resource-pipeline.md` itself asked for `work-orders.md` and `api-architecture.md` to be brought current as part of this work — can't edit those directly, so proposing the additions here:

**`work-orders.md`** needs a new section (something like "Lifecycle and rate authority") covering: the existing draft/finalized/revision model (append-only — a finalized work order is never mutated, `createRevision` copies its data into a new row); and the rate-authority rule (rates only ever come from rate cards, no freehand entry anywhere, finalize blocks on any unresolved line item).

**`api-architecture.md`**'s "minimum API surface" list is stale in more ways than the already-flagged missing Customers entry — it also doesn't mention `draft_work_order` or `propose_memory_entry` as agent tools, or that project reads/writes now include Work Orders and Agent Memory. Worth a full pass rather than another one-line patch, given this is now the third session flagging staleness in this same doc.
