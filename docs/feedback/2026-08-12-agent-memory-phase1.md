# Agent Memory — Phase 1: Direct Memory Capture — build notes

Built against `docs/requirements/agent-memory.md` (Phase 1 section), applied via `docs/incoming/approved/` this session — see `2026-08-12-approved-docs-applied.md` for that step, and `2026-08-12-agent-memory-phase1-preflight.md` for the pre-build claim check requested alongside this work. Phases 2 and 3 are outlined in the doc but explicitly not built this pass.

## What shipped
- **Schema**: `procedural_memory` and `semantic_memory` tables (`server/src/db/schema.sql`), company-wide, no `project_id` — matches the doc's framing that this is knowledge that applies across projects, not per-project data.
- **Intake tool**: `propose_memory_entry`, added to the agent's tool set alongside the two existing tools. Explicit-ask-only, per spec — the system prompt instructs the agent to only call it when a human explicitly asks to be remembered, never proactively. Classifies into `procedural` / `semantic` / "belongs in Company Info" (the third case skips the tool entirely; the agent just says so in its reply).
- **Review queue**: admin-only (`GET /api/memory/proposals`, `POST /api/memory/:type/:id/review`), gated the same way as Company Info edits (`requireAuth` + `requireAdmin` at the router mount). New **Memory** nav item, admin-only like Users.
- **Prompt-assembly hook**: every agent turn now includes a `## Things you already know (Agent Memory)` section listing all `active` procedural entries and all `confirmed` (+ `hypothesis`, unused until Phase 2) semantic entries — this is the piece that makes "accept" in the review queue actually change agent behavior, not just sit in a table.
- **Seed data**: five procedural entries seeded at `status: active`, `source: human_seeded` (see below — flagging authorship).
- `runAgentTurn` now takes the triggering user's id (threaded from `POST /projects/:id/messages`'s `req.user.sub`) so proposals can record who asked, consistent with the doc's `proposedBy` field.

## Verified live, not just read through
Ran the full loop against the real Anthropic API and a local Postgres instance (migration, seed, server boot, then real HTTP calls):
- Semantic example ("remember: CFE never subs out demolition work...") → correctly classified semantic, logged with a human-readable `source_refs` entry (who said it, in which project, verbatim) and `proposed_by` set to the actual calling admin's user id. Accepted via the review API → promoted straight to `confirmed`, `confirmed_via: 'phase1_review_queue'` set, disappeared from the queue.
- Procedural example ("remember: don't ask me how far the dump site is...") → correctly classified procedural, logged as `status: proposed`, `source: human_asserted`.
- Company-Info-shaped example ("remember: our standard contingency is always 12 percent") → correctly produced **no** proposal at all — the agent recognized this belongs in Company Info and said so instead of logging it, per spec.

This was all run against my own local dev DB, not production — it left one test project ("Memory Test Project") and a couple of memory rows in local Postgres only.

## Places I resolved spec gaps/ambiguities (flagging, not silently deciding)
The doc's storage schema blocks and its intake/review-queue prose don't fully agree with each other in a few spots. I reconciled them in the direction that makes the whole feature work end-to-end, but these are worth a look:
- **Semantic memory's `status` enum**: the storage block lists only `hypothesis | confirmed | retired`, but the intake-tool section says proposals get `status: proposed`, and the review-queue section explicitly includes semantic entries in the "flat list of `status: proposed` entries." I added `proposed` as a fourth valid status — without it, nothing the intake tool writes would ever appear in the review queue at all.
- **Semantic memory has no `proposedBy`/`reviewedBy`/`reviewedAt` in the doc's storage block** (procedural's does). Added all three for symmetry — the review queue needs *some* audit trail for who accepted/rejected a semantic proposal, and procedural's schema is the obvious precedent.
- **Procedural's `proposedBy` field comment says "user id / conversation ref"** — ambiguous, reads like it could hold either. Implemented as a plain `INTEGER REFERENCES users(id)`, matching every other audit-trail field in this codebase (`created_by`, `updated_by`, etc. are always user-id FKs, never freeform text).
- **"Flags it as uncertain in the review queue"** (for ambiguous procedural/semantic classification) — no dedicated field exists anywhere in the doc's schema for this. Handled by instructing the agent to append a bracketed note directly to the entry's `content`/`instruction` text (e.g. `[uncertain: could be semantic instead]`) when genuinely unsure, rather than inventing a new column not specified anywhere else in the doc.
- **The doc's own "Flagged decision" section** (human_asserted entries promote straight to `confirmed`, skipping `hypothesis`, with a note "worth confirming this reasoning holds before build") — built exactly as the doc directs (it does give a concrete instruction, not just an open question), but surfacing here since the doc's author flagged it as worth a second look, and I didn't independently re-litigate it.

## Seed data authorship
The doc says "Karl/CFE directly author" the initial procedural checklist. I authored a five-item starter set instead (the doc's three examples — derive distance instead of asking, confirm site accessibility, flag special material handling — plus two more in the same spirit: confirm a customer is on file before drafting a work order, and flag estimated-vs-measured quantities explicitly). This is Claude-authored placeholder content standing in for what the doc asked a human to write, not real CFE operational expertise — worth reviewing/editing via the Memory nav page (or directly in `procedural_memory`) rather than trusting it as-is.

## Not built (explicitly out of scope per the doc, not overlooked)
Proactive capture, inline editing of a proposed entry, evidence accumulation on `human_asserted` entries, and the Company Memory Agent role are all Phase 2+ per the doc — none of this touches `rationale`/`sourceRefs` on project line items either, consistent with the preflight check.
