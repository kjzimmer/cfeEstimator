# Simulated QuickBooks rate sync

Not built against an `incoming/` file — came out of discussing `task-resource-pipeline.md`'s rate-authority gate. Karl mentioned CFE's real rates likely already live in QuickBooks service items, and asked whether the agent should look them up there directly. Recording the design decision and what got built as a stand-in.

## Decision: sync into rate cards, not live lookup
Two options discussed: the agent calls the QuickBooks API live every time it needs a rate, or QuickBooks periodically syncs into the rate-card tables this app already has, with everything downstream unchanged. Went with sync, for two reasons:
- Live lookup couples every pricing action in the app to an external API's latency/uptime — QB slow or down would mean nobody can price a job.
- QBO service items carry a sales price but not necessarily a clean internal `cost` figure the way this app's rate cards track margin — a live pass-through would need to solve that mapping on every call, whereas a sync can resolve it once at sync time (or leave `cost` as something an admin still sets after syncing rates in, at least until that mapping is figured out for real).

This means the rate-authority gate work (`task-resource-pipeline.md` §4/§6) is unaffected by whenever real QB integration happens — "no rate card entry → unresolved → blocks finalize" doesn't care whether the missing entry would come from a human typing it in or a QB sync.

## What's built: a clearly-labeled simulation, not real integration
Karl doesn't have QuickBooks API access set up yet (needs an Intuit developer app + OAuth), so this can't be real today regardless of the sync-vs-live decision. Built the sync *shape* now so the rest of the pipeline work can proceed under that assumption, with the external call itself mocked:

- `server/src/services/quickbooksService.js` — `fetchRateItems()` returns a hardcoded mock list shaped like `{ category, name, unit, rate, cost }`. This is the **only** function a real QB integration needs to replace; every other file in this change only ever sees that same shape, same as a real rate-card row.
- `rateCardService.syncFromQuickBooks()` — upserts the mock items into the four existing rate-card tables by case-insensitive name (same matching rule the agent already uses via `findItemByName`). Never deletes — an item missing from a fetch is left alone, not treated as "QB removed this."
- Admin-only `POST /api/company-info/sync-quickbooks`, and a "Sync from QuickBooks (simulated)" button on each rate card table. The word "(simulated)" is in the UI copy deliberately, so nobody mistakes this for a working integration mid-demo.

**Verified locally**: ran the sync against the seeded local DB — 4 new items created, 9 existing ones updated, confirmed via a direct API call before and after. The mock data deliberately includes "Asbestos Handling & Disposal" at $3,000/job — the exact rate that was missing during Agent Memory testing — so the loop actually closes: that gap is now resolvable via the (simulated) sync.

## Open, not resolved here
- Where `cost` actually comes from in a real QB sync — QBO's cost concept for service items doesn't map cleanly to this app's "internal cost for margin tracking" `cost` field. Flagged, not solved; the mock just includes plausible cost figures so the simulation exercises the full shape.
- No deletion/reconciliation story for items removed from QuickBooks — not needed for a mock, will need a real decision once real sync exists (silently orphan the local row? flag it? deactivate it?).
- Sync is a manual admin button, not scheduled — fine for now, matches "rough but correct."
