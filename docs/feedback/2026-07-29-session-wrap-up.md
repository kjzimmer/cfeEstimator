# Session wrap-up — discrepancies from requirements

Final review pass before ending the session, checking the shipped app against `vision.md`, `functional_requirements.md`, `requirements/*.md`, `coding-standards.md`, `operations.md`, and `UX_design.md`.

## 1. Production DB holds fictional example data, not real content

At your direct request, I populated all six Company Info sections (Identity, Products & Services, Assets, Employee Base, Service Rates, Material Costs) with plausible-but-fictional example content, and created one example project ("Willow Creek Pole Barn," fictional customer "Willow Creek Farms") with a full definition built by actually running it through the live agent. This is on the **production** Railway deployment, not just local.

`company-info.md` says: "This phase: populate Identity with real CFE content. Other sections show as real nav entries with an empty-state message." Right now neither holds — Identity has invented content instead of real CFE facts, and the other five sections are filled with examples instead of the "coming soon" empty state.

This was intentional and requested (good enough for showing the customer the mechanic works), but flagging it explicitly: before this goes further than an internal/customer demo, or before anyone treats what's in that DB as real, Company Info should get real content and the example project should probably be deleted or clearly relabeled.

## 2. Minor: project `status` and `historical` fields aren't settable anywhere

`projects.md` lists `status` (freeform text) and `historical` (boolean) as real project fields, alongside `name`/`customer`. The create form (`ProjectsListPage.jsx`) only exposes `name` and `customer` — `status` and `historical` silently default to `''`/`false`. There's no endpoint or UI to edit either field after creation either, so a project can never actually become historical or carry a status through the UI as it stands.

Low priority: `api-architecture.md`'s own stated minimum API surface for this phase ("Project: create, list, get, update definition component") doesn't call for a general project-fields-update endpoint, so this isn't strictly a violation of what was speced — just an incomplete implementation of fields the schema and top-level requirements doc both describe as real. Worth picking up whenever project editing becomes a priority.

## Everything else checked out

Auth, the agent-sidebar behavior (autonomous writes, full-thread context per turn, files-by-filename-only), the file-viewer addition, and the doc-ownership/hierarchy rework from earlier this session are all consistent with what's currently written across the owned docs. No other discrepancies found in this pass.
