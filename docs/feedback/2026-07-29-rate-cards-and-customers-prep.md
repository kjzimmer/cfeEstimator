# Rate card + Customer prep for next phase — session notes

Built against the updated `requirements/company-info.md` and `requirements/customers.md` (already-updated docs, read at session start — no `incoming/approved/` file involved, folder is empty).

## What this was
Prep work requested ahead of the full "Company Info restructure" (#2) and "Customers" (#3) build-priority phases: reseed Service Rates / Material Costs as real structured data, and create a Customer record for Willow Creek Farms linked to the existing example project. Scoped deliberately to **backend + data only** — no Company Info UI rework, no Customers list/detail UI, no admin cost-gating (that depends on Admin roles, #1, which isn't built yet).

## What shipped
- **Schema**: new `customers`, `service_rate_items`, `material_cost_items` tables. `projects.customer` (free text) replaced with `projects.customer_id` (FK to `customers`), per `customers.md`.
- **API**: `GET/POST/PUT /api/customers`, `GET /api/customers/:id/projects`; `GET/POST/PUT/DELETE /api/company-info/:sectionKey/items` for the two structured rate-card sections (`service_rates`, `material_costs`). No cost-visibility gating yet — everyone with a valid token can currently read `cost`, since `isAdmin` doesn't exist. **Don't wire this to anything customer-facing before Admin roles (#1) lands and cost-gating is added.**
- **Data**: both rate cards reseeded with 8 plausible-but-fictional example rows each (excavation services / materials). Old freeform `content` on the `service_rates`/`material_costs` `company_info_sections` rows cleared. Created "Willow Creek Farms" Customer (fictional contact info) and linked it to the "Willow Creek Pole Barn" project (id 1) — confirmed by exact name match, not the similarly-named "Willow Creek Pole Barn 2" / "Billy Bob" project (id 2), which appears to be a stray test project and was left untouched.
- **Production**: applied directly (all three of you confirmed prod data isn't real / can be reseeded freely). Ran via Railway's Postgres public TCP proxy per `operations.md`. New one-off scripts committed for repeatability: `server/src/db/reseed-rate-cards.js` (destructive replace) and `server/src/db/seed-willow-creek-customer.js` (idempotent).
- Deployed (pushed to `main`) immediately after the DB migration, since the previously-deployed server code read the now-dropped `projects.customer` column directly in an `INSERT` — leaving it un-deployed would have made "create project" 500 on production.

## Minor UI touches, to avoid this being a straight regression
Kept to two things, not a UI rebuild:
- `ProjectsListPage.jsx` / `ProjectPage.jsx` now display `customer_name` (joined server-side) instead of the old free-text field, so the linked customer is still visible.
- Removed the free-text "Customer" input from the New Project form — it would otherwise silently do nothing now. Replaced with a one-line "coming with the Customers phase" note. The real fix (pick/quick-add a Customer inline) is `customers.md`'s job, not this session's.

## Known gaps / stray item found
- **"Willow Creek Pole Barn 2" / customer "Billy Bob"** (project id 2, production) — an untouched, unlinked duplicate-looking project. Not part of anything I built against; didn't touch it, flagging in case it's stray test data worth deleting.
- Rate-card items API has no cost-gating (see above) — expected gap until Admin roles ships.
- `api-architecture.md`'s "minimum API surface" list predates `customers.md` and doesn't mention Customers — probably just stale, not a deliberate omission. Worth a pass when Admin roles/Customers phases are formally scoped.
