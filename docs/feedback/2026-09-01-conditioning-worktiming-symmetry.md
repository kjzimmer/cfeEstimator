# Closing out the V3 review: hypothesis conditioning, work order timing, mob/demob symmetry

Third build in the same session as `2026-09-01-generalized-teaching-loop.md`,
closing out the remaining items from the V3 project review
(`2026-08-31-agent-address-and-procedural-memory-gap.md`'s follow-ups) plus
one new finding Karl caught while reviewing the teaching-loop's first real
output.

## 1. Quantitative hypotheses now require a stated condition

Karl reviewed the first hypothesis the generalized teaching loop produced
and caught a real quality problem immediately: *"mobilization typically
takes about 2 hours total"* stated a bare duration with zero mention of
distance -- even though mobilization time is fundamentally a function of
distance. His framing: this should have failed as an obvious red flag on
formation, not been left for someone to notice later.

There's no validation on hypothesis content at all today beyond an
exact-text duplicate check -- confirmed directly, not assumed. Rather than
add a heavy review gate (which would cut against the "form cheaply and
immediately" model just built), the fix reuses a principle already deeply
embedded elsewhere in this pipeline: **a number needs a stated basis, not
just an assertion.** `formSemanticHypothesis()` now rejects a quantitative
claim (anything with a digit in it) that doesn't also supply `appliesWhen`
-- the condition/variable the number is actually anchored to. The model can
either state the condition or, better, describe the relationship instead of
asserting a fixed outcome.

Verified this fallback path actually gets used, not just the rejection:
given a second data point on a follow-up message (12 miles / 45 minutes,
versus the first 90 miles / 2 hours), the agent abandoned the fixed-number
framing entirely and formed a new hypothesis -- *"Mobilization time scales
with distance from the shop to the site"* -- exactly the relationship-based
alternative this was designed to produce once a fixed number stopped making
sense.

Also caught, and worth being direct about: **one live run came back with an
empty agent reply** ("(no response)"), despite real work happening behind
the scenes (a good hypothesis was actually formed). Traced via temporary
debug logging to the tool-calling loop, not guessed at. Bumped the loop's
turn cap from 6 to 8 -- that cap was set before this agent had
`form_memory_hypothesis` or `resolve_resource_requirement`, and the tool
surface has grown enough that running out of turns on tool-only rounds
before reaching a final text reply is plausible. Also tightened the prompt
to explicitly forbid claiming to have "noted" something without the tool
call being present in the same turn, targeting the exact miss found in the
previous round (the agent said "I've noted..." with zero rows written).
Neither of these is a guarantee -- consistent with everything else in this
pipeline, a prompt change reduces a failure mode's likelihood, it doesn't
eliminate it.

Small phrasing note along the way: Karl asked for the acknowledgment
language to read more like natural conversation ("I'll keep this in mind
for future work orders too") than a formal status report ("I've noted that
X should always be Y") -- updated the prompt's example phrasing accordingly.

## 2. The Project Agent no longer drafts work order line items

Confirmed root cause from the V3 review, now fixed: the conversational
draft-a-work-order flow was directly responsible for the exact-duplicate-
line-item mess found there (manually chat-drafted lines with no task link,
invisible to and never reconciled by the mechanical Generate Line Items
pass). `draft_work_order` is now header-fields-only (scope text, site
location, requested start, contingency, terms) -- line items are
structurally ignored even if the model still sends them, not just
discouraged in the tool description, per this pipeline's established
practice of backing a prompt change with a real check once a failure mode
is understood. The system prompt's overall framing changed too: pricing
now explicitly happens outside the conversation (Generate Tasks -> approve
-> Generate Resource Requirements -> Generate Line Items), and the agent is
told to redirect a human who asks to price something in chat toward that
sequence, or toward the Work Order tab's existing manual "Scope only" form
for a genuine one-off outside the pipeline.

Verified live: asked the agent to add a line item in chat. It correctly
declined, explained the new sequence, pointed at the manual form as the
fallback, and asked a clarifying question about which task the request
actually belonged to. Confirmed directly in the database that no line item
was created as a side effect.

## 3. Resource Agent recognizes mirror/paired tasks

Confirmed from the V3 review: demobilization reliably ended up flagged
"Unresolved -- needs input" even when mobilization right next to it had a
complete, confident resource estimate -- treated as a fresh unknown instead
of the obvious mirror it usually is. New prompt guidance: when estimating a
task that's essentially another task run in reverse (mobilize/demobilize
being the common case, not the only one), use the counterpart's resources
as the starting point -- same equipment, same distance -- rather than
starting blind. Deliberately phrased as a starting assumption to reason
from, not a rule to apply blindly, since a real difference (equipment left
on site, a multi-stop job) should still override it; the rationale must
state the mirrored basis explicitly either way.

Verified live on a real project: demobilization went from a flagged
placeholder to a complete four-line estimate (labor + three equipment
lines), each rationale explicitly citing "Mirror of mobilization task
(existing id ...)" with the same equipment and distance. Also visibly
compounded with earlier fixes in the same run -- the demob labor line cited
a semantic memory hypothesis from several rounds ago (the "2 laborers, 2
hours each" correction), and the equipment lines cited this session's new
distance-scaling hypothesis -- multiple teaching-loop outputs working
together on one real estimate, not just in isolation.

## Status

Closes out every item from the V3 review and the first hypothesis-quality
finding. Karl's plan going forward: a fresh clean project test now that
these are in, which should exercise the full loop (address-aware
estimation, mob/demob symmetry, no premature work order, conditioned
hypotheses) together for the first time. Ninth entry in this series overall,
same still-unapproved `docs/incoming/task-resource-pipeline.md`.
