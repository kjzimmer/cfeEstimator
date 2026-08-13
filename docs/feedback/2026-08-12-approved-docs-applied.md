# Applied three approved/ drops: agent-memory.md, functional_requirements.md, requirements/README.md

Mechanical `docs/incoming/approved/` gate, per `docManagement.md` — no judgment applied, no edits en route.

## Applied
- `docs/incoming/approved/agent-memory.md` → `docs/requirements/agent-memory.md` (new file)
- `docs/incoming/approved/functional_requirements.md` → `docs/functional_requirements.md` (overwrite; adds section 8, Agent Memory)
- `docs/incoming/approved/requirements-README.md` → `docs/requirements/README.md` (overwrite; adds agent-memory.md to the file index, notes the 2026-08-05 audit supersedes the old build-priority list for items 1–5, and resequences build priority around Agent Memory's three phases)

All three had valid `<!-- target: ... -->` first lines pointing under `docs/` in the expected shape. Source files deleted from `approved/` after copying; only `.gitkeep` remains there now.

## What this starts
Per the accompanying instruction, building **Phase 1 (Direct Memory Capture)** only, per the full spec in the new `agent-memory.md`. Phases 2 (rationale/`sourceRefs` semantic-memory formation) and 3 (company data import) are outlined in that doc but explicitly not specced or built this pass.

Before starting the build, checked whether a specific claim in the surrounding instructions held up — see `2026-08-12-agent-memory-phase1-preflight.md` for that (short version: it didn't, and Phase 1 doesn't touch the fields in question anyway, so it doesn't change what gets built here).
