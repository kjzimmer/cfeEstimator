# Work Orders

## Why this exists
When a project is well-defined enough to send to the customer, generate a PDF work order from the project's data — the first concrete output artifact the app produces, versus everything so far being conversation and internal structure.

## Trigger and access
- Any logged-in user working the project can generate a work order — not admin-gated. Generating a document isn't the sensitive action; what's *in* it is (see Cost below).
- Manual action (a "Generate Work Order" button), not automatic. No judgment about "is this project ready" is encoded in the system — the human decides when to click it.

## Data sources
- **Company Identity** (`company-info.md`) — header/branding
- **Customer** record (`customers.md`) — customer block, site location if it differs from customer address
- **Project definition** (`projects.md`) — SOW narrative, labor/materials/equipment line items
- **Rate cards** (`company-info.md`) — Service/Material/Equipment/Role rate cards resolve each line item's price

## Output
- A PDF, generated server-side, following the structure of the example already produced: header, customer/site block, scope-of-work narrative, itemized line table (qty/unit/rate/amount), subtotal + contingency + total, terms, signature lines
- Auto-saved as a Project Document with `type: work-order` (see `project-documents.md`) — regenerating creates a new entry, doesn't overwrite the previous one, so there's a record of what was actually sent when

## Cost/profit guardrail — enforced in generation, not left to convention
The work order template only ever reads `rate` from rate cards, never `cost`. This should be structural — the PDF-generation code path has no access to `cost` fields at all, rather than "have access but remember not to use it." Estimated profit (sum of `(rate - cost) × qty` across line items) is a separate, admin-only view — computed and shown in the app UI (e.g. on the project page), never rendered into the customer-facing PDF.

If the agent ever drafts SOW language or line items in conversation (it already can, via `updateProjectComponent`), it has read access to cost data for internal estimating purposes — but should never surface cost or margin figures in anything phrased as customer-facing content. This is a behavioral instruction (system prompt), not a technical gate, since agent output all stays internal to the app today; revisit if agent output is ever piped somewhere customer-facing directly.

## Not this phase
- The full lifecycle flow around a work order (customer acceptance, e-signature, conversion to a signed contract) — this phase is PDF generation only
- Editing a work order after generation other than regenerating from updated project data
- Sending the PDF via email from within the app (download/manual send for now)
