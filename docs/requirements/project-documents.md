# Project Documents

## Why this exists
Files already belong to a project in the data model (`project_id` on File), but the only way to see one today is to find the chat message it was attached to. There's no list, no way to tell an uploaded site photo from a system-generated work order, and no way to attach a document without going through conversation. This closes that gap.

## What changes
- New **Documents** tab on the project page — a flat list of every file tied to the project, regardless of source
- Each file gets a `type`: `site-note` | `photo` | `work-order` | `other` (small fixed set, not open-ended — extend later if a real need shows up, don't pre-build categories nobody uses)
- Each file records its source: uploaded by a user (via chat or, new, directly in the Documents tab) vs. system-generated (e.g. a work order)
- Chat file-attachment stays exactly as it is — this is additive. A file attached in chat and a file uploaded directly in Documents both land in the same list; there's one File model, not two.
- New capability: upload a file directly to Documents, without going through the conversation (e.g. a signed contract added later, a scanned permit)

## Storage
Same as today — direct-to-Postgres for now (bytea/base64), not production-scale, revisit before real usage. Near-term: move to Cloudflare R2 once file volume becomes real rather than demo-scale (see `coding-standards.md`) — design the storage layer as a small abstraction now so this swap doesn't require touching every call site later.

Files are viewable inline (images/PDFs) or as a download link (other types). No OCR this phase — assume typed/legible input, or a human transcribes handwritten notes before upload. The agent sees filenames only, not file content; OCR/content-extraction is tracked separately in `functional_requirements.md`.

## Access
Any logged-in user with access to the project can view/upload/download. No admin gating here — this mirrors Projects, not Company Info.

## Not this phase
- Versioning (re-uploading a file overwrites nothing automatically — each upload is its own entry; if a work order gets regenerated, the old one just stays in the list as history, not replaced)
- Folders/organization beyond the `type` tag
- OCR/content extraction (tracked separately in `functional_requirements.md`)
