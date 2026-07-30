# Project Documents (#4) — build notes

Built against `requirements/project-documents.md`.

## What shipped
- `files` table gets `type` (`site-note` | `photo` | `work-order` | `other`) and `source` (`chat` | `direct` | `system`) columns, both small fixed sets with a Postgres `CHECK` constraint. Existing rows backfill to `source = 'chat'` (the only path that existed before) and `type = 'other'`.
- New **Documents** tab on the project page, alongside the existing Definition tab (both live in the same right-hand panel; the conversation stays fixed on the left — a persistent chat plus a tabbed detail panel, rather than losing the conversation when you check documents).
- Direct upload from the Documents tab: pick a type, pick a file, done — no chat message posted. One `files` table and one upload endpoint handle both paths, distinguished by a `source` field, per the doc's "one File model, not two."
- Chat attachment behavior is unchanged (still posts a thread message) but now also tags `source = 'chat'` and makes a light mime-based guess at `type` (image → `photo`, else `other`) so it isn't stuck untyped — chat attach stays a single click, not a form, so it doesn't prompt for a type.
- `work-order` is a valid type today but nothing produces one yet — that's Work Orders (#5), the next phase.

## Bug found and fixed during testing
Same class of issue as last session: `DocumentsPanel`'s fetch wasn't guarded against out-of-order responses. Fixed with the same cancellation-guard pattern now used consistently across `ProjectPage`, `CustomerDetailPage`, `RateCardTable`, and the Company Info freeform editor.

## Decisions made without asking
- Non-image chat attachments default to `type: 'other'` rather than trying to guess `site-note` vs something else from filename/extension — the doc doesn't ask for that inference and guessing wrong seemed worse than an honest "uncategorized."
- Access matches Projects (any logged-in user, no admin gating), per the doc's explicit call-out that this "mirrors Projects, not Company Info."
