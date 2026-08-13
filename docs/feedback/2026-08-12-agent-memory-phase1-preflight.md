# Preflight check before building Agent Memory Phase 1: rationale/sourceRefs PDF-exclusion claim

Requested check, done before starting any build work per the instruction that came with this session's three `docs/incoming/approved/` drops (`agent-memory.md`, `functional_requirements.md`, `requirements-README.md`).

## The claim
Referenced as "the rationale/sourceRefs PDF-exclusion guardrail... already-applied in an earlier session" — i.e. an assertion that `work-orders.md` (or the PDF-generation code) already has a structural guardrail keeping `rationale`/`sourceRefs` fields out of the customer-facing work order PDF, the same way it already does for `cost`.

## What I checked
- Read the current `docs/requirements/work-orders.md` in full. Its only exclusion guardrail is the existing **cost/profit** one (`## Cost/profit guardrail` section) — no mention of `rationale` or `sourceRefs` anywhere in the file.
- Grepped `docs/` and `server/` for `rationale` and `sourceRefs`. Zero hits anywhere except inside the three new incoming files themselves (`agent-memory.md`'s Phase 2 outline, which is where these fields are first introduced).

## Finding: the claim doesn't hold
`rationale` and `sourceRefs` don't exist anywhere yet — not in the DB schema, not in server code, not in any currently-active requirements doc. They're introduced in `agent-memory.md` as **Phase 2** fields on project-definition line items, which this session isn't building. There is nothing to have a PDF-exclusion guardrail *for* yet, so "already applied in an earlier session" isn't accurate as far as I can verify — either the earlier session being referenced didn't happen against this codebase, or the claim conflated this with the existing (real) cost/profit guardrail.

## What I did about it
Nothing — per the instruction, not building this as part of Phase 1. It wasn't in Phase 1's scope regardless (Phase 1 is procedural/semantic memory capture, no line-item schema changes at all), so this doesn't change Phase 1's plan. Flagging here so that whenever Phase 2 (`rationale`/`sourceRefs` on line items) actually gets built, it starts from "this guardrail needs to be built," not "this guardrail already exists and just needs to be preserved" — those are different build tasks and conflating them would be a real gap if Phase 2 skipped building the guardrail because it assumed it was already there.
