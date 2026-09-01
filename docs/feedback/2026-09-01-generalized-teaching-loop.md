# The teaching loop generalizes to any request, not just corrections or "remember this"

Follow-on to the V3 review findings (`2026-08-31-agent-address-and-procedural-memory-gap.md`),
prompted by Karl explicitly working through a design philosophy for how
learning should happen in this system, using the mobilization/demobilization
gap as the concrete example.

## The framing, as Karl stated it

A teachable moment doesn't require a human to say "remember this," and it
doesn't require the AI to have been wrong first (a correction). An ordinary
request, made once, is itself a training signal. The reasoning loop:

- Is this specific to this one job, or could it generalize?
- If it could generalize, form a hypothesis and start using it immediately
  -- don't wait for confirmation first.
- Each time a similar situation comes up, reconsider whether the hypothesis
  applies -- that's what cements it (or lets it fade if it doesn't recur).
- If genuinely unsure, it's fine to ask -- but that's a separate, harder
  capability (deliberately still deferred, see below).
- This applies symmetrically to the negative case: a request that seems to
  contradict what the agent would expect is just as much a learning trigger
  as one that confirms it.

Critically, Karl also stated the operating model this needs to support:
**human review of the memory queue will be rare by design.** He intends to
watch the system periodically -- possibly via a dedicated agent built for
exactly this -- not to intervene routinely, but to catch edge cases where
learning isn't working, fix those, and otherwise leave the system alone.

## Why this wasn't just "add a new tool"

The resource-correction loop (built two entries ago) already does almost
exactly this, just narrowly triggered -- editing an AI resource estimate
immediately becomes an active `hypothesis`-status semantic memory entry,
no review queue, used right away. Confirmed working well: a hypothesis
formed from one correction got correctly reused across four unrelated
tasks in a later run.

The actual gaps to close, given Karl's stated review-will-be-rare model:
1. **Trigger too narrow.** Only an explicit "remember this" (`propose_memory_entry`)
   or a resource correction reached memory at all. An ordinary request like
   "add mobilization" reached neither path.
2. **Procedural memory had no hypothesis-equivalent.** Semantic memory could
   already go active immediately; procedural could only go through the
   `proposed` → admin-reviewed → `active` path. Given review will be rare,
   anything still requiring it before taking effect would functionally
   never activate.

## What's built

- `procedural_memory` gains `status: 'hypothesis'` (mirrors semantic_memory
  exactly) and an `evidence` column (same shape/purpose as semantic_memory's).
- `memoryService.formProceduralHypothesis()` / `formSemanticHypothesis()`:
  create-or-reinforce, active immediately. An exact-text-match repeat merges
  into the existing entry's evidence instead of duplicating (same
  string-match-only limitation as the task exact-duplicate check -- a
  reworded repeat needs the model to recognize it's already listed, not a
  structural guarantee).
- Project Agent gains `form_memory_hypothesis`, explicitly usable after any
  substantial request/correction/preference -- not gated behind an explicit
  ask. Kept `propose_memory_entry` (the explicit-ask, review-gated path)
  unchanged and separate; an explicit "remember X" is a different kind of
  assertion than an inferred pattern and still gets the stronger gate.
- Resource Agent's `propose_process_improvement` now writes through the same
  immediate-hypothesis path instead of the old reviewed-proposal queue --
  same consistency reasoning.
- Memory Review UI shows status + evidence count for procedural entries
  too (previously only semantic entries showed status), since procedural
  can now sit mid-hypothesis rather than always simply "active."

## Verification, including an honest miss

Told the Project Agent, in the flow of a real request (not a "remember"
ask), to add mobilization/demobilization because CFE always travels to
site. Result: it correctly formed **two separate hypotheses of different
types from one conversational exchange** -- a procedural one ("CFE
projects should always include mob/demob tasks as standard scope") and,
once given trip specifics on a follow-up message, a semantic one ("~2
hours total when equipment travels together") -- each active immediately,
each citing the specific request that triggered it.

Also caught something worth being direct about rather than burying: on the
*first* message, the reply text claimed *"I've noted that mobilization and
demobilization tasks should always be included"* -- but zero database rows
were written. It said it did something it never actually called the tool
for. Confirmed by adding temporary debug logging to the tool-call loop,
not by trusting the reply. This is exactly the shape of edge case Karl
described wanting to catch by watching rather than intervening -- and it's
also exactly the kind of thing this pipeline has had to build structural
backstops for repeatedly (task duplication, resource omission) when a
prompt-only instruction turned out not to be reliably followed. No
structural fix exists for *this* specific failure mode yet, because "does
the reply's claim match what actually got persisted" isn't a clean thing
to check in code the way "does every task have a resource row" is -- it's
a genuine candidate for whatever periodic review/watcher process Karl
builds next, not something to paper over here.

## Explicitly still deferred

The "ask when genuinely unsure" half of Karl's framing. Related to, but
more scoped than, the general proactive-question capability deferred
earlier in this series -- this version's trigger would specifically be
"uncertain whether a hypothesis generalizes," not "missing any input."
Held off for the same reason as before: it needs somewhere to land
asynchronously without blocking, a meaningfully different problem than
same-turn hypothesis formation. Revisit once there's a body of real
hypotheses to observe and a clearer sense of how often genuine uncertainty
(versus confident-but-wrong, like the miss above) actually comes up.

## Status

Eighth entry in this series, all against the still-unapproved
`docs/incoming/task-resource-pipeline.md`. Karl mentioned intending to
build a dedicated agent for periodic review of accumulated memory/evidence
-- this is very close to the already-named, not-yet-built Company Memory
Agent (`task-resource-pipeline.md` §7), with a sharper mandate now than
originally scoped: diagnostic edge-case-hunting across the whole system,
not per-item accept/reject curation. Worth designing with that framing in
mind whenever it gets built, rather than the original "review the queue"
framing.
