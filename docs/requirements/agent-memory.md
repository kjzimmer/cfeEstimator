
# Agent Memory

## Principle
The agent should get better at working with CFE over time — both at *what it
knows about excavation work* and at *how it should behave as an assistant* —
as usage accumulates. That requires three distinct kinds of memory, each with
a different lifecycle, and (for one of them) a distinct agent role beyond the
per-project Project Agent already described in `agent-sidebar.md`. Conflating
the tiers, or conflating "the agent should behave differently" with "the
agent should know a different fact," produces confused mechanisms — this doc
keeps them separate on purpose.

## The three tiers, in one paragraph each

**Episodic** — individual project data: SOW, line items, conversation,
documents. Already covered by existing project/document machinery. Nothing
new. Grows automatically from both live project work and company data
import (Phase 3) — no distillation happens at this tier, it's just what the
agent can look up directly.

**Semantic** — generalized domain knowledge ("narrow-access sites in this
county typically need a mini-excavator"), distilled from episodic data or
directly asserted by a human, held at `hypothesis` status until a human
review promotes it to `confirmed` (or `retired`). This is the tier that
actually makes future estimates better rather than merely correctable.

**Procedural** — how the agent should *behave*, independent of any domain
fact ("don't ask for something derivable, go derive it"). Lives in system
prompts / tool-use instructions today, hand-edited, no memory mechanism at
all. This doc gives it one.

## Build plan — three phases

This doc specs **Phase 1** in full. Phases 2 and 3 are outlined below at
the level needed to see how Phase 1 fits, not built out yet — full specs
follow once Phase 1 is running and (for Phase 3) once remaining open
questions on that phase are resolved.

1. **Phase 1 — Direct memory capture** (this doc, full spec below). A human
   tells the agent to remember something. The agent classifies it as
   procedural or semantic, logs a proposal, and an admin reviews/accepts it
   through a no-code review queue — accepted entries flow into real storage
   that the agent's system-prompt assembly actually reads, not into a doc
   someone has to hand-copy into a prompt. Also seeds an initial procedural
   checklist (site distance, accessibility, material handling, etc.) as
   known-good active entries from day one, authored directly rather than
   agent-proposed.
2. **Phase 2 — Rationale-driven semantic memory.** Project-definition line
   items gain `rationale` and `sourceRefs` fields. The Project Agent runs a
   generalizability self-check while writing rationale, forming semantic
   hypotheses as a byproduct of normal estimating. A second agent role, the
   Company Memory Agent, periodically reviews accumulated hypotheses (this
   phase: manual trigger) and promotes/retires them. Builds on Phase 1's
   semantic memory table rather than a separate one.
3. **Phase 3 — Company data import.** Ingests legacy rate cards and
   historical project records into structured data. Explicitly episodic,
   not semantic — imported records are facts about past jobs, not
   generalized patterns, and don't feed semantic memory this phase (see
   `company-data-import.md` for the full Phase 3 design; several questions
   there remain open and are tracked separately).

---

# Phase 1 — Direct Memory Capture

## Why this is Phase 1, not Phase 2
This is largely independent of the rationale/`sourceRefs` schema work and
addresses a live cost: right now, a human has to repeat context to the agent
across sessions because there's no "remember this" path at all, for either
behavioral instructions or domain facts a human just wants to assert. Small
in scope — one new table pair, one intake tool, one flat review queue, one
prompt-assembly hook — and a real prerequisite for Phase 2's Company Memory
Agent, which extends this same semantic memory table rather than replacing
it.

## Storage

### Procedural memory (new)
```
{
  id,
  instruction,      // the behavioral rule, imperative prose
                     // e.g. "Don't ask for distance to a known site — derive
                     // it from project location + company location."
  status,            // 'proposed' | 'active' | 'retired'
  source,            // 'human_seeded' | 'human_asserted' | 'agent_proposed'
  proposedBy,        // user id / conversation ref, when proposed via intake
  reviewedBy,        // admin user id who activated/retired it
  createdAt,
  reviewedAt
}
```
`human_seeded` entries (the initial checklist, see below) can be written
directly at `status: active` — they don't need to pass through the proposal
queue since there's no agent judgment involved in creating them.

### Semantic memory (new — minimal version; Phase 2 extends this)
```
{
  id,
  content,           // the generalization, prose
  status,            // 'hypothesis' | 'confirmed' | 'retired'
  origin,            // 'human_asserted' | 'agent_inferred'
                      // NOTE: distinct from Phase 3's import-provenance
                      // `origin` field (imported/native) — do not conflate
                      // the two; different table, different meaning.
  sourceRefs: [],     // optional — e.g. the conversation message where a
                       // human asserted this
  evidence: [],        // always empty at Phase 1 creation; Phase 2 wires up
                        // evidence accumulation from rationale-writing
  createdAt,
  confirmedAt?,
  confirmedVia?        // e.g. 'phase1_review_queue' — see promotion note below
}
```

## The intake tool
A human, in any project's conversation thread, explicitly asks the agent to
remember something ("remember: don't ask me how far the dump site is, just
figure it out" / "remember: CFE never subs out demo work"). This phase,
capture is **explicit-ask only** — the agent does not proactively detect a
correction and offer to remember it unprompted (see Out of scope).

On an explicit ask, the agent:
1. **Classifies** the statement into one of three buckets:
   - **Procedural** — an instruction about agent conduct, not a domain fact.
     Test: would this ever appear as a `sourceRef` explaining why a specific
     line-item number is what it is? If no, it's procedural.
   - **Semantic** — a durable domain generalization.
   - **Company Info** — a standing policy or number that already has a home
     (rate, standard contingency percentage, a blanket operational rule).
     The agent does **not** write a memory-table proposal for this case — it
     tells the human this sounds like it belongs in Company Info and points
     them there. No new proposal path needed; Company Info already has its
     own admin-edit mechanism.
2. For procedural/semantic classifications, calls one generic tool —
   `proposeMemoryEntry(type: 'procedural' | 'semantic', content, sourceConversationRef)`
   — consistent with the existing "one generic tool, not one per type"
   pattern from `api-architecture.md`. Writes a `status: proposed` row.
3. Confirms back in the thread what it logged and where ("I've noted that as
   a procedural rule — an admin will need to approve it before it takes
   effect").

If classification is genuinely ambiguous, the agent still logs a proposal
(best-guess type) but flags it as uncertain in the review queue rather than
guessing silently — surfaced to the reviewer, not hidden.

## Review queue
Admin-only, matching Company Info's existing edit permission level.

- Flat list of `status: proposed` entries — procedural and semantic, either
  as one combined view or two tabs. No polish beyond functional; "rough but
  correct," same posture as every other phase in this project.
- Per entry: **accept** or **reject**. No inline editing this phase — if a
  proposal is wrong, reject it and have the human restate it; not worth
  building an edit UI yet (same reasoning already applied to line-item
  rationale corrections in the earlier discussion).
- **Accept** → procedural entries go to `status: active`. Semantic entries
  go to `status: confirmed` directly, **not** `hypothesis` — flagged decision,
  see below.
- **Reject** → `status: retired` (kept, not deleted, so an unchanged
  restatement of the same rejected idea isn't silently re-proposed and
  re-reviewed from scratch).

**Flagged decision:** accepted `human_asserted` semantic entries promote
straight to `confirmed` rather than sitting at `hypothesis` awaiting a
Phase 2 Company Memory Agent pass. Reasoning: the risk that gates
`agent_inferred` hypotheses behind a separate company-level review is that
project-level evidence (a PM's in-thread reaction) is a narrower check than
a company-wide one. Here, the admin's accept decision in this queue *is*
that company-level check — a second review step would be redundant, not
safer. Worth confirming this reasoning holds before build, since it's a
real asymmetry between how the two origin types get trusted.

## Prompt-assembly hook
Every agent turn (Project Agent, per `agent-sidebar.md`) currently assembles
context from Company Info + project definition + thread + files. This adds:
- All `status: active` procedural memory entries
- All `status: confirmed` (and, once Phase 2 exists, `status: hypothesis`)
  semantic memory entries

This is the piece that makes the review queue's "accept" button actually do
something — without it, an accepted entry sits in a table nobody reads.
Call out as its own explicit build step, not an assumed side effect of the
schema existing.

## Seed data
At build time, Karl/CFE directly author an initial procedural checklist —
things every excavation job needs answered without asking, not learned
through trial and error (distance to site, accessibility, special material
handling, and others as identified). Written directly at `status: active`,
`source: human_seeded` — bypasses the proposal queue since there's no agent
judgment involved in creating them, only in applying them.

## Out of scope for Phase 1
- **Proactive capture** — the agent noticing an unprompted correction and
  offering to remember it, without being explicitly told to. Explicit-ask
  only this phase, for reliability; proactive detection is a behavioral
  refinement to revisit once explicit capture is proven.
- **Inline editing** of a proposed entry before accept/reject.
- **Evidence accumulation** on `human_asserted` semantic entries — that
  mechanism belongs to Phase 2's rationale-driven formation path; Phase 1
  entries just sit at `confirmed` once accepted, full stop.
- **Company Memory Agent** — Phase 1's review queue is a single accept/
  reject step, not the richer confirm/retire dialogue role Phase 2 defines.
- **"Silent application as evidence"** — whether an agent-inferred hypothesis
  applied repeatedly with no human pushback should count as weak implicit
  support. Real open question, belongs to Phase 2, not resolved here.

## Relationship to Phase 2 and 3
- The semantic memory table above is the *same* table Phase 2's
  rationale-driven formation writes into — `origin: agent_inferred` entries
  land here too, with the fuller hypothesis → evidence → Company-Memory-
  Agent-confirmation lifecycle Phase 2 will spec. Phase 1 does not need to
  anticipate that lifecycle beyond leaving `evidence: []` and `status:
  hypothesis` available as valid states.
- Phase 3's company-data-import `origin` field (`imported` | `native`) is a
  different field on a different table (project-history / line items) —
  named the same but unrelated; flagged above to prevent confusion during
  build.
