# Initial build-out — API layer, auth, nav shell, agent sidebar

Built through build priority items 1-6 from `requirements/README.md` in one session: API layer, auth, nav shell, agent sidebar, Company Info (structure), basic file upload. Verified end-to-end in a real browser (Playwright) against a live local Postgres DB and the real Anthropic API — login, project creation, a full agent turn that called `update_project_component` three times and updated the definition panel with the pulse animation, and file upload.

## Decisions made where the spec was ambiguous

- **Agent → data access path**: `api-architecture.md` says the agent should go through "the same endpoints the UI uses," described as Claude tool-calling "against those endpoints." I implemented this as the agent's tool handler calling the same service-layer functions (`projectService.updateDefinitionComponent`, etc.) that the HTTP route handlers call, rather than the agent doing an HTTP loopback call to its own Express server. Same code path and no duplicated logic, no direct DB bypass — but if "endpoints" was meant literally (HTTP), flag that and I'll switch it.
- **Company Info "Identity" content**: per your call, left editable but empty like the other sections rather than seeding placeholder text — the empty-state copy ("Not yet configured — coming soon") shows for all six sections until real content is entered through the UI.
- **Message model sender identity**: `messages.user_id` is null for agent messages; `sender_type` (`user`/`agent`) distinguishes them. Seemed like the simplest fit for the "agent as thread participant" model without a fake system user row.

## Things worth knowing about this environment specifically

- **Vite pinned to 5.4.x, not the latest 8.x.** `create-vite`'s current default template pulls in Vite 8 with the experimental Rolldown (Rust) bundler, which has broken native bindings on this machine (`Cannot find module '@rolldown/binding-win32-x64-msvc'`). Vite 5 is stable, widely used, and has no such issue. Worth revisiting if you want Rolldown's speed later once it's less new.
- **`npm audit` shows one moderate esbuild advisory** (dev-server-only, lets any website reach the local Vite dev server) that only clears by upgrading to the broken Vite 8. Low risk for an internal prototype not exposed to the internet; left as-is.
- **multer bumped from the scaffolded 1.x to 2.x** — 1.x has known vulnerabilities and is deprecated upstream. Verified file upload still works after the bump.
- **Ports 3001 and 5173-5175 were already in use by unrelated processes on this machine** (other local projects, it looks like) during testing — not anything this app started. Dev servers picked the next free port automatically; nothing to do here, just flagging in case it's confusing later.

## Not built yet (deliberately, per build priority order)
Company Info Identity real content, and everything under "near-term, not-yet-scheduled" in `functional_requirements.md` (R2 storage, OCR, satellite imagery). Agent autonomous-write-vs-confirm question from `api-architecture.md` also still open — currently autonomous, as the doc's this-phase default says.

## Later in this session: doc ownership process, and two new docs proposed

After the initial build-out (above), this session went on to deploy to Railway (several rounds of build/runtime debugging — see `operations.md` in this folder), seed example data, add a file-viewer modal, and make a couple of UX tweaks. During that work I twice edited `UX_design.md` directly (a background-color token change and a sticky-nav note) in response to direct requests. You asked for those edits to be reverted and moved here instead — established going forward: I don't edit `vision.md`, `functional_requirements.md`, `requirements/*.md`, `coding-standards.md`, or `UX_design.md` directly; deviations get written to `docs/feedback/` as proposals for you/the DevOps agent to fold in on your own review cadence. You're taking the exact shape of this process back to the DevOps agent before it's codified in `CLAUDE.md`.

Two new docs proposed as part of that same conversation, both drafted here rather than at `docs/` root, per the same process:

- **`operations.md`** — deploy/infra/ops knowledge: environments, why Nixpacks over Railpack, the monorepo build pattern, Node version pinning, required env vars, reaching the production DB from a local machine, and how to debug a bad deploy. Includes a placeholder section for the dev → staging → production sequence you're expecting to add later — intentionally left undefined until that's actually being built, but the doc now has an obvious home for it.
- **`docManagement.md`** — repo structure (moved out of `coding-standards.md`, which should have that section removed once this is adopted, to avoid saying it twice), the doc ownership table, the hierarchy principle (parents stay at why/what, siblings don't overlap, no mega-docs), and the change process itself. This doc governs the others, including itself.

Both were drafted pulling from existing docs where content already existed (repo layout out of `coding-standards.md`) rather than duplicating it. Neither has been placed at `docs/` root — that's your and the DevOps agent's call once reviewed.
