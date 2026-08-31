# Unresolved resource questions resolve through conversation, not forms

Follow-on to `2026-08-31-resource-agent-reconciliation.md`, from the same
testing session against the real "Fire Debris Removal and Structural
Cleanup" production project. Two things came out of Karl reviewing the
actual run: (1) some tasks had zero resources with no explanation, and (2)
some owner-responsibility tasks had CFE resources describing the owner's
own substantive work, not CFE coordination. A third, harder question
underneath both: when the agent genuinely can't determine something, how
should that get resolved?

## The resolution model: conversation is the input surface, not a form

Karl's explicit correction to my first proposal (which was "the human edits
the flagged row directly"): in this app generally, the conversation is how
humans enter data — forms are the manual fallback, not the primary path.
Applied here: a human should tell the *agent* what's needed in chat, and
the agent makes the entry — not fill out the Tasks tab themselves.

This split cleanly across the two agents that already exist, without new
architecture:
- **Resource Agent** flags what it can't determine (`flag_unresolved_resource`
  — new tool), reusing the existing `confident`/`uncertainty_note` shape
  rather than inventing a new concept. Shows up in the Tasks UI with the
  same amber treatment any other low-confidence estimate already gets.
- **Project Agent** (`agentService.js`) gains visibility into these open
  questions (a new context section, `buildOpenResourceQuestionsContext`)
  and a `resolve_resource_requirement` tool. When a human's message answers
  one, the Project Agent calls it directly — going through the *human-facing*
  `resourceRequirementService.updateRequirement()` path, so it sets
  `human_reviewed` and triggers the same correction-evidence capture a
  direct edit would. The conversation-mediated path and the form-mediated
  path both end up as "a human corrected this," which is the actually
  correct classification either way.

Deliberately did **not** reintroduce the raw conversation thread into the
Resource Agent's context to make this work (which would have undone the
circular-citation fix from the previous entry). The two agents stay
separated the way they already were: the Resource Agent proposes/flags in
the background: the Project Agent, which already has full conversational
context as its normal mode, is where an answer actually lands.

## A prompt instruction that provably didn't work, replaced structurally

First attempt: give the Resource Agent `flag_unresolved_resource` and an
explicit "never silently omit a task" instruction, and expect it to use the
tool when it can't determine something. Tested directly rather than
assumed: a live run had the tool available, the instruction in its system
prompt, and **still left 5 tasks with zero resources and zero explanation**
— it just never called `flag_unresolved_resource` at all, identical
behavior to before the tool existed. Checked the trace to confirm: no
attempt, no reasoning, nothing.

This is the same category of finding as the orphan-task and duplication
bugs from earlier entries — a prompt telling the model what to do is not
evidence it will. Fixed structurally instead of trying a third prompt
variant: after the repair pass, the *code* now creates the flagged
placeholder for any task still missing, rather than hoping the model calls
the tool. Every task ends up with something visible in the UI either way —
guaranteed by the orchestration, not requested of the model. The run's
`stopped` message now reads "flagged for human input" rather than "add
manually," reflecting that the gap is now an actionable, visible item, not
a silent hole.

## responsible_party — a real gap, not a judgment call

Checked two real examples from the production run: a CFE labor line on
"File CDPHE asbestos notification" (owner responsibility) whose rationale
described CFE *preparing and submitting* the notification, and a CFE "other"
line on "Complete asbestos survey and sampling" (also owner responsibility)
describing CFE *paying for* the inspector and lab fees. Both wrong in the
same way: attributing the owner's substantive work to CFE.

Root cause found directly, not inferred: the Resource Agent's context never
included `responsible_party` at all — it had no way to know which tasks were
CFE's versus the owner's. Fixed by adding it to the per-task context, with
explicit guidance following Karl's stated principle: every task, including
owner/third-party ones, plausibly has a real CFE coordination-time resource
(someone has to track, confirm, follow up) — but that must be described and
reasoned as coordination, never as CFE performing the substantive work
itself. Not yet re-verified against a live run with an owner task (the
local test project used for this round's other verification doesn't have
one) — worth confirming next time Karl runs against the production project
directly.

## Verification

Full loop verified directly end-to-end, not by inspection: reset a test
project's resource requirements, ran generation until the structural
fallback produced a flagged placeholder, posted a chat message answering it
in the human's own words, ran the Project Agent's turn, and confirmed:
`resolve_resource_requirement` was called; the requirement updated with the
human's actual stated words as rationale (not paraphrased or invented); a
new semantic memory hypothesis was created citing that exact reasoning as
its content and the flagged-placeholder-to-resolved transition as evidence.
Also fixed a cosmetic double-space in the evidence-capture content string
noticed while reading this output (empty original unit left two spaces
where one was expected).

## Status

Fourth entry in this series, all built against the still-unapproved
`docs/incoming/task-resource-pipeline.md`. Open item carried forward from
the previous entry, still true: nothing yet promotes an accumulating
`hypothesis` to `confirmed` or retires it — that's the Company Memory
Agent, still not built. Every correction captured this session (including
the ones from resolving unresolved flags via chat) is accumulating there
with no review gate yet.
