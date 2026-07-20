# Documentation Management

Defines how this project's documentation is structured, who owns which doc, and the process for changing them. This doc governs the other docs — if a rule here conflicts with how another doc is actually being maintained, this doc wins and the other should be brought into line.

## Doc index

| Doc | Scope | Changes rarely / often |
|---|---|---|
| `vision.md` | Why this exists, what success looks like | Rarely |
| `functional_requirements.md` | Stable, top-level feature list — the *what*, not the *how* | Rarely |
| `requirements/*.md` | One file per feature area, implementation-level detail | As features develop |
| `coding-standards.md` | Code conventions: naming, data-modeling patterns, testing policy, commit style | Occasionally |
| `operations.md` | Deploy/infra/ops: environments, build system, required config, debugging playbooks | Occasionally |
| `UX_design.md` | Design tokens and visual direction | Occasionally |
| `docManagement.md` (this doc) | Repo structure, doc ownership, hierarchy rules, process | Rarely |
| `incoming/` | Inbox — raw new requirements/decisions before triage into the docs above | Continuously (files come and go) |
| `feedback/` | Outbox — session results, questions, blockers, proposed doc changes awaiting review | Continuously (files come and go) |

## Repo structure

```
/client         - React app (Vite + Tailwind)
/server         - Express app; serves the API and, in production, the built client
/docs           - all planning/spec docs (this folder)
CLAUDE.md       - Claude Code's own pointer/instructions file (not a spec doc -- see below)
package.json    - root convenience scripts (install:all, dev, build, start, db:migrate, db:seed)
```

(Moved here from `coding-standards.md`, which previously held repo structure — flagging that its "Repo layout" section should be removed once this doc is adopted, to avoid the two saying it in two places.)

## Hierarchy principle

- **Parent docs stay at "why" and "what."** `functional_requirements.md` should never restate implementation detail that belongs in a `requirements/*.md` child — if it does, that's overlap to clean up, not a feature of the structure.
- **Sibling docs shouldn't overlap.** Each `requirements/*.md` file owns one feature area; if two files describe the same thing, one of them is wrong.
- **No mega-docs.** A doc that combines multiple unrelated topics should be split by concern instead — this is why `operations.md` and `docManagement.md` exist as their own files rather than folded into `CLAUDE.md` or `coding-standards.md`.

## Ownership and change process

**Human + DevOps agent own:** `vision.md`, `functional_requirements.md`, `requirements/*.md`, `coding-standards.md`, `operations.md`, `UX_design.md`, and this doc. Claude does not edit these directly.

**Claude owns:** code, and files in `docs/feedback/`.

When a session's work deviates from what an owned doc says — whether Claude finds a fault in it, or the human directly asks for a change that contradicts or extends what's written — the code change ships, but the corresponding doc update is written to `docs/feedback/` as a proposal instead of applied directly. The human/DevOps agent review feedback files on their own cadence and fold changes into the owned docs (or reject them) manually.

`CLAUDE.md` is a different category — it's Claude Code's own operating/context file, not a project spec doc, so Claude updating it collaboratively (when the human gives an explicit, durable process instruction) is expected, not a violation of this rule.

**Open question, not yet resolved:** `CLAUDE.md`'s working agreement currently has Claude fold `docs/incoming/` content directly into `requirements/*.md` (and delete the incoming file) as part of normal work. That's the same category of direct edit to an owned doc as anything else covered by this rule. Whether `incoming/` → `requirements/` should also move to the propose-via-feedback pattern, or whether it's different because it's transcribing already-decided human input rather than Claude's own judgment call, is for the human/DevOps agent to decide.

## `incoming/` and `feedback/` folders

- `incoming/`: drop new requirements/decisions here as raw notes. Once triaged and folded into the relevant owned doc (see open question above), the incoming file is deleted — git retains the history.
- `feedback/`: Claude's outbox for session results, ambiguity calls, blockers, and (per this doc) proposed changes to owned docs. Resolved items get deleted once folded in or rejected.
