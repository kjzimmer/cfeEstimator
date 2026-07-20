# CLAUDE.md

## What this repo is
A web app for CFE (excavation contractor) centered on a conversational AI agent that helps employees move a job from site visit through bid to execution — replacing today's disconnected, uncoordinated use of ad hoc AI chats with a shared, company-context-aware tool.

This file is a pointer, not the spec. Read the docs below before doing any work.

## Where to look
- `docs/vision.md` — why this exists, what success looks like
- `docs/functional_requirements.md` — top-level feature requirements (stable, changes rarely)
- `docs/requirements/` — detailed, area-by-area breakdown of the above; start with `docs/requirements/README.md` for the index and current build priority
- `docs/coding-standards.md` — stack, conventions
- `docs/operations.md` — deploy/infra/ops: environments, build system, required config, debugging a bad deploy
- `docs/UX_design.md` — lightweight UX/visual direction (intentionally minimal for now — see the doc itself)
- `docs/docManagement.md` — **read this before touching any doc.** Defines who owns what and the change process; the rules below are just a summary of it
- `docs/incoming/` — finished requirement updates land here for you to build against
- `docs/feedback/` — your outbox: results, comments, questions, blockers, and proposed changes to owned docs

## Working agreement
1. Before starting work: read `vision.md`, `functional_requirements.md`, everything in `requirements/`, `coding-standards.md`, `operations.md`, and check `docs/incoming/` for anything to build against.
2. You never edit, move, rename, or delete anything in `docs/incoming/`, `requirements/*.md`, or any other doc listed as human/DevOps-owned in `docManagement.md` — with one mechanical exception: if a file exists in `docs/incoming/approved/`, copy everything after its first line (`<!-- target: ... -->`) — not that line itself — into the path it declares, delete the file from `approved/`, and confirm in `docs/feedback/`. No edits en route, no judgment call about whether it's "ready" — its presence in that folder is the only signal you act on. If a file there is missing a target or the target looks wrong, stop and write it up in `docs/feedback/` instead of guessing. Everything else in `docs/incoming/` (outside `approved/`) you build against normally, but ship deviations to `docs/feedback/` rather than editing an owned doc yourself.
3. When you finish a session, or hit a decision point/blocker, leave a note in `docs/feedback/` — including which `incoming/` file (if any) you built against, so the human can close the loop.
4. This is a fast-moving prototype. Prioritize a working, demoable product over completeness. Where a feature is intentionally not built yet, stub it visibly (e.g., a nav item with a "coming soon" state) rather than omitting it silently — the prototype needs to look like a maturing product, not a partial one.
5. Stack: React frontend + Express backend, single deployable service (Express serves the built React app), Postgres via Railway addon, deployed on Railway. Don't introduce additional services/infra without flagging it — check with the human first.

## Current phase
See `docs/requirements/README.md` for the live index and build priority. As of this writing: API layer first, then a basic app shell + navigation, with the per-project agent sidebar (chat + live-updating project definition panel) wired early since it's the core differentiating experience.
