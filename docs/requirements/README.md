
# Requirements Breakdown — Index

Top-level requirements live in `../functional_requirements.md` and don't change often. This folder is the detailed, area-by-area breakdown of those.

## Files
- `api-architecture.md` — how the agent and UI both interact with project data (read this first, it constrains everything else)
- `auth.md` — includes `isAdmin` and what it gates
- `company-info.md` — structured (rate/cost cards) vs. freeform split
- `customers.md`
- `projects.md` (includes file upload)
- `project-documents.md` — unifies files into a real per-project document list
- `agent-sidebar.md`
- `work-orders.md` — PDF generation
- `agent-memory.md` — new, phased build: direct memory capture (Phase 1, spec'd), rationale-driven semantic memory + Company Memory Agent (Phase 2, outlined), company data import (Phase 3, outlined — see `company-data-import.md` in `docs/incoming/` for that phase's detail, still carrying open questions)

## Status
Per `feedback/2026-08-05-requirements-audit.md`, auth, Company Info structure, Customers, Projects core, Project Documents, and Work Orders all matched spec as of that audit — the "current build priority" list below predates that audit and should be treated as stale for items 1–5; confirm actual status before resequencing around it.

## Current build priority (next phase)
1. ~~Admin roles~~ / ~~Company Info restructure~~ / ~~Customers~~ / ~~Project Documents~~ / ~~Work Orders~~ — per the audit above, appear built; verify before treating as remaining work
2. **Agent Memory — Phase 1: Direct Memory Capture** (`agent-memory.md`) — new table pair (procedural + semantic memory), intake tool, admin review queue, prompt-assembly hook, seed procedural checklist. Small, largely independent of the items below.
3. **Line item rationale + semantic memory formation** (Agent Memory Phase 2, folded into `agent-memory.md` once spec'd) — adds `rationale`/`sourceRefs` to project-definition line items; depends on Phase 1's semantic memory table existing.
4. **Company data import** (Agent Memory Phase 3 / `company-data-import.md`) — depends on Phase 2's unified line-item schema question being resolved first; several open questions not yet finalized.
