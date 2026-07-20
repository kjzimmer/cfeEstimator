# Coding Standards

## Stack
- Frontend: React
- Backend: Express
- Database: Postgres (Railway addon)
- File storage: Cloudflare R2 — not wired this phase (files go directly into Postgres for now), but part of the intended stack. Build the storage layer as a small abstraction (e.g. a `storage.put()/get()` module) so swapping the backing store to R2 later doesn't mean touching every call site.
- Deployment: Railway — single service; Express serves both the API and the built React static assets (see `operations.md` for the how: build system, env vars, debugging a bad deploy)
- Agent: Anthropic API (Claude), called server-side only — never expose an API key to the client

Repo layout has moved to `docManagement.md` — don't restate it here.

## Conventions
- JS/TS: camelCase for variables/functions, PascalCase for React components
- Postgres: snake_case column names; translate at the data-access layer if convenient
- Flexible/evolving data (project definition, company info sections): store as JSON/JSONB columns rather than rigid relational schemas, since these are expected to change shape frequently during this prototype phase. Revisit once the shape stabilizes.
- Environment config via `.env`, never committed. `.env.example` should list required keys with no real values.
- No enforced test suite this phase — prototype speed takes priority over coverage. Leave a `// TODO: needs test` comment on anything you'd be nervous shipping without one, rather than skipping silently.
- Commit in small, working increments where possible — a broken `main` blocks demoing, which is the whole point right now.

## Agent access to project data
The agent is a client of the API, not a special case. All project reads/writes the agent performs go through the same endpoints the UI uses — implemented as Claude tool-calling against those endpoints, not direct DB access and not prose that gets parsed after the fact. Use one generic tool for updating a project component (taking a component key + freeform content) rather than a typed tool per component, to stay compatible with the JSON-blob project definition model.

## Things to flag to the human before doing
- Adding any new external service/infra beyond what's in `operations.md` or `requirements/` (e.g. a new API vendor, a new Railway service)
- Any change that would make historical and current projects diverge into different data models
- Any decision that locks in a rigid schema for something explicitly called out as "expected to evolve" in the requirements docs
