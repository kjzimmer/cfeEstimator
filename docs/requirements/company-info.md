# Company Info

## Principle
Structure data when it's deterministic, stable-shaped, and gets spliced verbatim into computed output (a rate card feeding a work order line item) or needs to be queried/aggregated. Leave it freeform markdown when the shape is still evolving, it's narrative context for the agent rather than a template input, or it's low-volume prose an admin edits occasionally. Don't force structure where it doesn't earn its cost — a field nobody fills in because it doesn't help is worse than no field.

## Structured sections (real DB tables, not markdown blocks)

- **Identity**: single record — company name, address, phone, email, website. Exactly what appears in a work order header.
- **Service Rate Card**: rows of `{ service name, unit, rate, cost }`. `rate` = billed to customer, `cost` = internal cost to CFE. Feeds work order line items and profit calculations.
- **Material Cost Card**: rows of `{ material name, unit, rate, cost }`. Same rate/cost split as Service Rates.
- **Equipment/Asset Rate Card**: rows of `{ equipment name, unit (hr/day), rate, cost }`.
- **Employee Role Rate Card**: rows of `{ role name, unit (hr), rate, cost }` — rate by *role*, not a named staffing roster with availability/scheduling. A full staffing feature is a separate, later concern; this only needs to answer "what does an hour of a laborer/operator/etc. cost and bill at."

**Cost and rate visibility**: `rate` is visible to any logged-in user (needed to build estimates day-to-day). `cost` and any derived profit/margin figures are admin-only — see `auth.md`. **Cost must never appear in customer-facing output** (work orders, any generated document sent externally) regardless of who generated it, including the agent — see `work-orders.md` for how this is enforced in the generation step itself, not just left to good behavior.

## Freeform sections (markdown blocks, as originally designed)

- **Products & Services**: descriptive context for the agent, never spliced into a computed template slot — stays freeform.
- **Employee Base (general notes)**: anything beyond the rate card above (team structure, general capacity notes) — freeform until/unless a real staffing feature is scoped.

## Editing and visibility
- Admin-only to edit any Company Info section (structured or freeform)
- Non-admins can view: Identity, Service/Material/Equipment/Role *rates* (not cost), Products & Services, Employee Base notes
- No separate "job history" section — historical job data lives in Projects instead (see `projects.md`)
- Empty-state sections still show as real nav entries ("not yet configured — coming soon") rather than being hidden — visible roadmap, not hidden scope
