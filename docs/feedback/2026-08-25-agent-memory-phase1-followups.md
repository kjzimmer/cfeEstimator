# Agent Memory Phase 1 follow-ups: rate-shape fix + retired-history view

Built against the two items `docs/incoming/requirements-README.md`'s "Current build priority" listed under Phase 1 follow-ups. Not built against `task-resource-pipeline.md` or the new `agent-memory.md`/`requirements-README.md` — those are still sitting in `docs/incoming/` (not `approved/`), under discussion, not built.

## Test data cleanup
Deleted the "$3,000 flat rate for asbestos handling" semantic proposal from production directly (SQL `DELETE`, not reject-to-retired) — Karl confirmed it was test data, and hard-deleting keeps it from cluttering the retired-history view being built in the same session with fake content that was never a real business decision.

## Fix: rate-shaped statements were misclassifying as semantic memory
Root cause: the intake classifier checked "is this Company-Info-shaped" as one bucket among three, evaluated on the statement as a whole. A statement mixing a genuine domain fact with a specific rate ("we're certified for asbestos removal and charge a flat $3,000 for it") doesn't cleanly match any single bucket, and the model picked semantic — logging the whole statement, price included, as a memory proposal instead of deflecting to Company Info.

Fix: reordered the classifier's own instructions in `agentService.js`'s `propose_memory_entry` tool description — check for a rate/price/percentage *first*, before attempting procedural/semantic classification at all, and explicitly state that a mixed statement is Company-Info-shaped as a whole, not split. Added the exact failing example inline in the instructions, since concrete examples correct this kind of classification far more reliably than an abstract rule.

**Verified live** against the real Anthropic API, not just read through:
- The exact original failing statement → now correctly produces **no proposal**, with the agent's reply identifying the rate and pointing to Company Info.
- A pure capability claim with no rate ("CFE is fully certified and equipped for asbestos removal work") → still correctly logs as **semantic**, confirming the fix didn't overcorrect into blocking legitimate domain facts.

## Added: retired-history view
Previously, once a proposal was rejected, it vanished from the app entirely — the only way to see it (or confirm it was ever rejected, vs. still pending, vs. never created) was a direct database query. This is exactly the gap that made it impossible to confirm what happened to the earlier rate-card-authority proposal during the "getting reacquainted" summary.

Added `GET /api/memory/retired` (same admin-only gating as the rest of `/api/memory`) and a collapsible "Show retired (rejected) entries" section at the bottom of the Memory page, lazy-loaded on first expand (same pattern as the existing profit-summary toggle in Work Orders). Verified locally: rejected a leftover test proposal, confirmed it appeared in `/retired` and disappeared from `/proposals`.

## Not touched this pass
Everything in `task-resource-pipeline.md` (work order lifecycle correction, tasks/dependencies, Resource Agent, rate-card authority gate) and the accompanying `agent-memory.md`/`requirements-README.md` updates — still under discussion per `2026-08-24`'s review notes. Those three files remain in `docs/incoming/` (not `approved/`), read but not built against.
