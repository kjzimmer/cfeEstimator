# Projects

- Create / list / view
- Fields: name, `customerId` (foreign key to Customer — see `customers.md`; was free-text `customer`, now structured), status (freeform text — no state machine yet), `historical` boolean flag
- Historical and current projects created and viewed the same way — the flag is just a filter, not a different data model or UI
- **Project definition**: stored as a JSON blob per project, keyed by component name (`sow`, `location`, `materials`, `assets`, `labor`, `billing`, `siteVisit`, etc.) — new keys can appear without a schema migration

## File upload
Files attach to projects — full spec (storage, types, upload/view UI) lives in `project-documents.md`, not here, to avoid saying it twice.

