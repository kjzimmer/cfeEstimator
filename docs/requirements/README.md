# Requirements Breakdown — Index

Top-level requirements live in `../functional_requirements.md` and don't change often. This folder is the detailed, area-by-area breakdown of those.

## Files
- `api-architecture.md` — how the agent and UI both interact with project data (read this first, it constrains everything else)
- `auth.md` — includes `isAdmin` and what it gates
- `company-info.md` — structured (rate/cost cards) vs. freeform split
- `customers.md` — new
- `projects.md` (includes file upload)
- `project-documents.md` — new, unifies files into a real per-project document list
- `agent-sidebar.md`
- `work-orders.md` — new, PDF generation

## Status
**Built and demoed**: API layer, auth (single role), nav shell, agent sidebar, Company Info structure, basic file upload — see `docs/feedback/` for session notes from that build.

## Current build priority (next phase)
Roughly dependency-ordered — later items build on earlier ones:
1. **Admin roles** (`auth.md`) — prerequisite for everything below that has cost/permission gating
2. **Company Info restructure** (`company-info.md`) — structured rate/cost cards, admin-only edit and cost visibility
3. **Customers** (`customers.md`) — including the `Project.customer` → `Project.customerId` migration
4. **Project Documents** (`project-documents.md`) — unify file storage into a real per-project list
5. **Work Orders** (`work-orders.md`) — depends on 2, 3, and 4 all being in place
