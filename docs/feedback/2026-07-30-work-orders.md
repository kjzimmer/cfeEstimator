# Work Orders (#5) — build notes

Built against `requirements/work-orders.md`, and against your direction mid-session: agent drafts, human edits, structured line-item form backed by the rate cards, draft/finalized/revision lifecycle, agent and UI sharing one API.

## What shipped
- **New entity**: `work_orders` (draft/finalized status, revision number, scope text, site location, contingency %, terms, link to the generated PDF) + `work_order_line_items` (name/unit/qty/rate, plus a nullable `cost`). At most one draft per project at a time (partial unique index).
- **The cost firewall is structural, not conventional**: `cost` is captured server-side (never trusted from client input) so the admin-only profit view can compute `sum((rate-cost)×qty)`. But PDF generation calls `getLineItemsForPdf()`, a dedicated query that doesn't `SELECT cost` at all — verified in testing that the generated PDF contains zero cost/profit figures.
- **Agent drafts, human finalizes**: the agent got one new tool, `draft_work_order`, wired through the exact same `workOrderService` functions the REST routes call — no special agent-only path. It resolves rate-card references server-side by name against the live catalog (never trusts a model-invented rate), which I verified: asking the agent to draft "5 hours of Excavation - Standard Dig, 2 tons of Crushed Stone" produced a draft with the real catalog rates ($185/hr, $42/ton) and real costs captured, not hallucinated numbers. The agent has **no** finalize/generate-PDF tool — `work-orders.md` is explicit that's a human judgment call, so that action only exists as a UI button.
- **Lifecycle**: draft is fully editable (line items via rate-card picker or manual entry, contingency, terms, scope, site location) by any logged-in user, not admin-gated — matches the doc's "not the sensitive action, what's in it is." Finalizing generates the PDF, saves it as a `type: work-order` / `source: system` Project Document, and locks the record. "Create Revision" copies a finalized work order's data into a new draft.
- PDF layout follows the doc's spec: header, customer/site block, scope narrative, itemized table, subtotal/contingency/total, terms, signature lines. Uses `pdfkit` (new dependency) — pure JS, no headless-browser/native-binary requirement, fits Railway's Nixpacks build without extra system packages.

## Bug found and fixed during testing
The client had a real state-management bug: after finalizing, the draft editor's generic `onChange` callback set local state to the now-finalized object, but the view-switch logic only checked "is there a draft," so it kept rendering the (now immutable) draft editor instead of switching to the finalized summary + Create Revision view. Fixed by giving finalize its own callback that triggers a full reload instead of reusing the generic update path. Caught this via actual browser click-through (Playwright) — the API was correct the whole time (verified finalize succeeded server-side both times), it was purely a client rendering bug that curl/API testing alone would never have surfaced.

## Testing note
Confirmed the generated PDF content directly (not just that a PDF-shaped file exists) by downloading one and reading it. One thing I could **not** verify visually: the in-app PDF viewer modal's iframe preview, specifically — headless Chromium doesn't ship a PDF-rendering plugin, so the automated screenshot shows a blank frame even though the HTTP response, mime-type detection, and blob-URL wiring all check out correctly via DOM inspection. This is a known headless-browser limitation, not something I can rule out as a real bug from this environment alone — worth a 30-second manual check in an actual browser before you rely on it.

## Decisions made without asking
- Manual (non-rate-card) line items have `cost: null` — there's no source of truth to resolve a cost from, so the profit view reports them as "unknown cost" and excludes them from the total rather than guessing.
- The agent's rate-card catalog context includes `rate` but not `cost` — work-orders.md explicitly allows the agent cost access for internal estimating, but I didn't wire that up this pass to keep the initial surface smaller; flagging as a natural fast-follow if you want the agent to reason about margins in chat.
- Revision numbers are per-project sequential integers (1, 2, 3…), not dates or free text.

## Addendum: PDF formatting pass
You shared a cleaner reference layout (two-column header with a WO number, orange section headings, dark table header, two-column customer/site block, tighter signature block) and asked me to match it. Rebuilt `workOrderPdfService.js` around it, plus one new field the reference had that the schema didn't: `requested_start` (freeform, e.g. "Week of August 11, 2026") — added to `work_orders`, wired through the service/route/agent tool/client form the same way the other draft fields are.

Two real layout bugs surfaced only by actually rendering a PDF with realistic dollar amounts (small test values like `$84.00` had hidden them):
- The amount/rate columns were sized for small numbers and wrapped anything like `$35,200.00` onto a second line, which cascaded into overlapping rows and a broken totals block. Fixed by widening those columns and adding `lineBreak: false` on every numeric cell as a second guardrail.
- The "Scope of Work" heading inherited its x-position from whichever column (left or right) last wrote text above it, so it sometimes rendered indented under the right column instead of flush left — you caught this one. Fixed by giving section headings an explicit x instead of relying on pdfkit's carried-over cursor position.

Noted your comment that a generalized reporting feature is likely coming — flagged in the code that today's header/footer/branding constants are Work-Order-specific and are the values to lift out first if that gets scoped, but didn't build toward that speculatively this pass.
