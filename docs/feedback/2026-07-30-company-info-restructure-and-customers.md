# Company Info restructure (#2) + Customers (#3) — build notes

Built together against `requirements/company-info.md` and `requirements/customers.md`, per your call to work both phases at once since a chunk of the backend for each was already in place from the prep session.

## What shipped

**Company Info restructure:**
- Identity is now a real single-row structured table (`company_identity`: company name, address, phone, email, website) with its own admin-gated form — left blank so real CFE content can be entered through the UI rather than invented by me (see the prior session's wrap-up note about not wanting fictional identity data).
- Two more structured rate cards added: Equipment/Asset Rate Card and Employee Role Rate Card (`equipment_rate_items`, `employee_role_rate_items` — same shape as the Service/Material cards from last session), seeded with plausible fictional examples.
- The old freeform `company_info_sections` rows for identity/assets/service_rates/material_costs are deleted (schema.sql does this as a migration step) — only Products & Services and Employee Base remain freeform, matching the doc's split.
- Company Info page rebuilt around a fixed 7-section nav (was DB-driven, now a static config in the page since sections now have genuinely different shapes: structured-identity / freeform-textarea / rate-card-table). Each rate card renders as an editable table (admin: full CRUD + cost column; non-admin: read-only, no cost column — enforced both server-side, already done last session, and client-side by not rendering the controls).

**Customers:**
- New Customers nav item: list + detail view, detail page shows the customer's project history (any logged-in user can view/edit, not admin-gated, per the spec).
- Project creation form now has a real Customer `<select>` (existing customers + "+ New customer…" quick-add), replacing the placeholder text that shipped last session.

## Bug found and fixed during testing
Both `RateCardTable` and the Company Info freeform editor fetched section data in a `useEffect` keyed on the section, but didn't guard against out-of-order responses — clicking through sections quickly could let a stale, late-arriving fetch overwrite the current section's state with the wrong data. Added the same cancellation-guard pattern already used in `ProjectPage.jsx`/`CustomerDetailPage.jsx` to both. Found this by driving the actual app with Playwright (not just reading code) — screenshotting after realistic rapid navigation caught it; a slower click-through wouldn't have.

## Testing note
No project skill existed yet for running this app, so I set one up ad hoc (Playwright + Chromium via `npx`, since `chromium-cli` wasn't available in this environment) to click through both admin and non-admin flows in an actual browser and inspect the rendered DOM/screenshots, not just the API. Didn't turn that into a committed project skill (`/run-skill-generator`) since the setup was mostly just "install Playwright" — flagging in case you want that captured for next time regardless.

## Decisions made without asking
- Kept `api-architecture.md`'s note from last session unresolved (still doesn't list Customers in the minimum API surface) — not touched again, same reasoning as before.
- Didn't build a "delete customer" or "delete project" affordance — neither doc asked for it, and Projects still doesn't have one either, so this stays consistent.
