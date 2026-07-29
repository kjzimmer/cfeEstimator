# Customers

## Why this exists
`Project.customer` was a free-text string. That's fine until you want a customer's project history, or a work order that needs a real address and contact — both need a structured record, and "who's worked with this customer before" is exactly the kind of query a string field can't answer.

## Data
- Customer: name, address, primary contact name, phone, email, notes (freeform — this one stays markdown-ish since customer notes are narrative, not computed)
- `Project.customer` becomes `Project.customerId`, a foreign key to Customer

## Access
- Any logged-in user can view, create, and edit Customer records — same permission level as Projects. Customers are operational data people need day-to-day, not sensitive in the way cost data is.

## UI
- New nav item: **Customers** — list view, detail view
- Customer detail view shows the customer's project history (current + historical projects, same underlying model as `projects.md` already describes)
- Project creation flow: select an existing Customer or quick-add a new one inline, rather than typing a name that may or may not match an existing record

## Migration note
Existing/seeded projects have `customer` as free text. When this is built: either map existing text values to new Customer records where they clearly match, or leave them unmatched and clean up manually — not worth automating a fuzzy-match for a handful of demo records.

## Not this phase
- Customer portal / customer-facing login (Customers are managed by CFE employees only; customers themselves don't log in)
- Duplicate detection/merging
