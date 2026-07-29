# Top-Level Requirements

These are the stable, top-level features. They don't change often — phase-by-phase build detail lives in `requirements/` instead.

## 1. Auth
- Employee login
- `isAdmin` flag gates: user management (view/add users — non-admins can't see the user list at all), editing Company Info, and viewing cost/profit figures anywhere they appear

## 2. Company Info
- Company identity, products/services, assets, employee base, service rates, material costs
- A mix of structured data (identity, rate/cost cards) and freeform markdown (descriptive/narrative sections) — see `requirements/company-info.md` for which is which and why
- Rate (customer-facing price) is visible to all users; cost and derived profit figures are admin-only
- Used by the agent as context for estimating and planning
- No separate "job history" section — historical job data lives in Projects (see below), not in Company Info

## 3. Customers
- Structured customer records (name, address, contact) — not free text on Project
- Any logged-in user can view/create/edit
- Customer detail view shows that customer's project history

## 4. Projects
- Create, list, view projects
- Current and historical projects use the same underlying model — a historical project is just a project with a status/flag indicating it's in the past, not a separate feature
- Each project belongs to a Customer (see above)
- Each project has a **project definition**: a set of named components (e.g. SOW, Location, Materials, Assets, Labor, Billing, Site Visit) that is expected to evolve — new component types will be added over time, so this should not be a rigid fixed schema

## 5. Project Documents
- Every file tied to a project (chat-attached, directly uploaded, or system-generated) is visible in one place, not just findable through chat history
- Small fixed set of document types (site-note, photo, work-order, other)

## 6. Agent Sidebar (per project)
- A persistent, shared conversation thread per project — multiple employees post into the same thread, agent included as a participant
- The agent's core job: read the conversation + project files + company info, and incrementally build/update the project's definition components — starting from a blank project and working toward something bid-ready
- Site visit input (typed notes, handwritten notes, images) is expected to be an early and heavy input source
- Audio input (customer calls, employee conversations) is an anticipated future input, not required immediately — data model should accommodate it without a rewrite

## 7. Work Orders
- Generate a PDF work order from a well-defined project's data, for sending to the customer
- Any project participant can generate one — not admin-gated
- Cost/profit figures never appear in the generated document, regardless of who/what generated it

## Near-term, not-yet-scheduled needs
These are known to be coming soon but are not committed to a specific phase yet:
- Real file storage (Cloudflare R2) — needed once file upload usage becomes real rather than demo-scale
- OCR / handwriting extraction for site visit notes — expect this to be unreliable even with good models; likely needs a human-review step, not full automation, for a while
- Satellite imagery lookup from a project's geolocation — needs a mapping/imagery API vendor decision; not yet clear which specific use case (site verification? access/terrain planning?) this serves, which should be nailed down before committing build time to it
