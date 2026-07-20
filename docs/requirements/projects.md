# Projects

- Create / list / view
- Fields: name, customer, status (freeform text — no state machine yet), `historical` boolean flag
- Historical and current projects created and viewed the same way — the flag is just a filter, not a different data model or UI
- **Project definition**: stored as a JSON blob per project, keyed by component name (`sow`, `location`, `materials`, `assets`, `labor`, `billing`, `siteVisit`, etc.) — new keys can appear without a schema migration

## File upload
- Basic upload attached to a project
- This phase: stored directly in Postgres (bytea or base64) — not production-scale, revisit before real usage
- Near-term: move to Cloudflare R2 once file volume becomes real rather than demo-scale (see `../coding-standards.md` for stack notes) — design the storage layer as a small abstraction now so this swap doesn't require touching every call site later
- No OCR this phase — assume typed/legible input, or a human transcribes handwritten notes before upload
- Uploaded files are viewable from the conversation (inline preview for images/PDFs, download link for other types) — the agent still only sees filenames, not file content; OCR/content-extraction remains tracked separately in `functional_requirements.md`
