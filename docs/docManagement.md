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
| `incoming/` | Inbox — finished requirement content, authored by DevOps/human, for Claude Code to build against | Continuously (files come and go) |
| `incoming/approved/` | Approval gate — files here (with a declared `target`) get mechanically applied to `requirements/` by Claude Code; nothing else does | Continuously (files come and go) |
| `feedback/` | Outbox — session results, questions, blockers, proposed changes to owned docs, awaiting review | Continuously (files come and go) |

## Repo structure

```
/client         - React app (Vite + Tailwind)
/server         - Express app; serves the API and, in production, the built client
/docs           - all planning/spec docs (this folder)
CLAUDE.md       - Claude Code's own pointer/instructions file (not a spec doc -- see below)
package.json    - root convenience scripts (install:all, dev, build, start, db:migrate, db:seed)
```

## Hierarchy principle

- **Parent docs stay at "why" and "what."** `functional_requirements.md` should never restate implementation detail that belongs in a `requirements/*.md` child — if it does, that's overlap to clean up, not a feature of the structure.
- **Sibling docs shouldn't overlap.** Each `requirements/*.md` file owns one feature area; if two files describe the same thing, one of them is wrong.
- **No mega-docs.** A doc that combines multiple unrelated topics should be split by concern instead — this is why `operations.md` and `docManagement.md` exist as their own files rather than folded into `CLAUDE.md` or `coding-standards.md`.

## Ownership and change process

**Human + DevOps agent own:** `vision.md`, `functional_requirements.md`, `requirements/*.md`, `coding-standards.md`, `operations.md`, `UX_design.md`, and this doc. Claude Code does not edit these directly — and does not edit `docs/incoming/` either (see below).

**Claude Code owns:** code, and files in `docs/feedback/`.

When a session's work deviates from what an owned doc says — whether Claude Code finds a fault in it, or the human directly asks for a change that contradicts or extends what's written — the code change ships, but the corresponding doc update is written to `docs/feedback/` as a proposal instead of applied directly. The human/DevOps agent review feedback files on their own cadence and fold changes into the owned docs (or reject them) manually.

`CLAUDE.md` is a different category — it's Claude Code's own operating/context file, not a project spec doc, so Claude Code updating it collaboratively (when the human gives an explicit, durable process instruction) is expected, not a violation of this rule.

### `incoming/` → `requirements/` — resolved

`docs/incoming/` holds finished, ready-to-build-against requirement content authored by the human/DevOps agent. Claude Code reads it and implements against it — but that alone is **not** authorization to update `requirements/*.md`. That requires an explicit approval signal: `docs/incoming/approved/`.

**`docs/incoming/approved/` is the approval gate.** A file lands here only once the human/DevOps agent has explicitly signed off that it's ready to become the permanent record — never because Claude Code judged its own implementation complete or correct. Each file declares its own destination on the first line, e.g. `<!-- target: docs/requirements/projects.md -->`.

**Claude Code's rule for this folder is purely mechanical, no interpretation required:**
- If a file exists in `docs/incoming/approved/`, copy its content — **everything after the first `target` line, excluding that line itself** — into the path it declares as `target`, creating or overwriting that file exactly, no edits, formatting changes, or "improvements" en route. The `target` line is staging metadata; it does not appear in the destination file.
- Delete the file from `docs/incoming/approved/` once copied, and confirm in `docs/feedback/`.
- If a file in `approved/` has no `target` line, or the declared target doesn't fall under `requirements/` (or another doc explicitly designated for this pattern), stop and write it up in `docs/feedback/` instead of guessing.

This is a check, not a decision: "does this file exist in this specific folder, with this specific field" is objective and requires no judgment, unlike "does this implementation look done." Claude Code still never touches `docs/incoming/` (either subfolder) or `requirements/*.md` based on its own assessment of readiness — only in direct, mechanical response to a file someone with actual approval authority has already placed in `approved/`.

This structure is deliberately generic about *who* has approval authority — today that's the human directly; if a persistent DevOps agent takes over that role later, the contract Claude Code operates under doesn't change at all, only who's writing to `approved/`.

## `incoming/` and `feedback/` folders

- `incoming/`: the human/DevOps agent drops finished requirement content here for Claude Code to build against. Claude Code reads it but never edits, moves, or deletes it.
- `incoming/approved/`: the approval gate — see above. Only files placed here by someone with actual approval authority get mechanically applied to `requirements/` by Claude Code.
- `feedback/`: Claude Code's outbox for session results, ambiguity calls, blockers, and proposed changes to owned docs. Resolved items get deleted once folded in or rejected.
