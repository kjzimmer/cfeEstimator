# CLAUDE.md

## What this repo is
A web app for CFE (excavation contractor) centered on a conversational AI agent that helps employees move a job from site visit through bid to execution — replacing today's disconnected, uncoordinated use of ad hoc AI chats with a shared, company-context-aware tool.

This file is a pointer, not the spec. Read the docs below before doing any work.

## Where to look
- `docs/vision.md` — why this exists, what success looks like
- `docs/functional_requirements.md` — top-level feature requirements (stable, changes rarely)
- `docs/requirements/` — detailed, area-by-area breakdown of the above; start with `docs/requirements/README.md` for the index and current build priority
- `docs/coding-standards.md` — stack, conventions, repo structure rules
- `docs/UX_design.md` — lightweight UX/visual direction (intentionally minimal for now — see the doc itself)
- `docs/incoming/` — new work items and requirement changes land here before they're folded into the docs above
- `docs/feedback/` — leave results, comments, questions, and blockers here for the human to review

## Working agreement
1. Before starting work: read `vision.md`, `functional_requirements.md`, everything in `requirements/`, `coding-standards.md`, and check `docs/incoming/` for anything not yet incorporated.
2. If `docs/incoming/` has files, fold their content into the relevant doc, then delete the incoming file (git remembers it).
3. Keep docs and code in sync — if a build decision changes what a `requirements/` file describes, update that file in the same pass.
4. When you finish a session, or hit a decision point/blocker, leave a note in `docs/feedback/`.
4. This is a fast-moving prototype. Prioritize a working, demoable product over completeness. Where a feature is intentionally not built yet, stub it visibly (e.g., a nav item with a "coming soon" state) rather than omitting it silently — the prototype needs to look like a maturing product, not a partial one.
5. Stack: React frontend + Express backend, single deployable service (Express serves the built React app), Postgres via Railway addon, deployed on Railway. Don't introduce additional services/infra without flagging it — check with the human first.

## Current phase
See `docs/requirements/README.md` for the live index and build priority. As of this writing: API layer first, then a basic app shell + navigation, with the per-project agent sidebar (chat + live-updating project definition panel) wired early since it's the core differentiating experience.
