# Top-Level Requirements

These are the stable, top-level features. They don't change often — phase-by-phase build detail lives in `requirements-breakdown.md` instead.

## 1. Auth
- Employee login, extensible to multiple roles over time
- Starts with a single enforced role; the data model should not assume only one role will ever exist

## 2. Company Info
- Company identity, products/services, assets, employee base, service rates, material costs
- Used by the agent as context for estimating and planning
- Not all sections need real content immediately, but the structure for each should exist and be visible in the UI (as populated or as a clearly-marked placeholder)
- No separate "job history" section — historical job data lives in Projects (see below), not in Company Info

## 3. Projects
- Create, list, view projects
- Current and historical projects use the same underlying model — a historical project is just a project with a status/flag indicating it's in the past, not a separate feature
- Each project has a **project definition**: a set of named components (e.g. SOW, Location, Materials, Assets, Labor, Billing, Site Visit) that is expected to evolve — new component types will be added over time, so this should not be a rigid fixed schema
- Files (site visit notes, photos, customer docs) attach to projects

## 4. Agent Sidebar (per project)
- A persistent, shared conversation thread per project — multiple employees post into the same thread, agent included as a participant
- The agent's core job: read the conversation + project files + company info, and incrementally build/update the project's definition components — starting from a blank project and working toward something bid-ready
- Site visit input (typed notes, handwritten notes, images) is expected to be an early and heavy input source
- Audio input (customer calls, employee conversations) is an anticipated future input, not required immediately — data model should accommodate it without a rewrite

## Near-term, not-yet-scheduled needs
These are known to be coming soon but are not committed to a specific phase yet:
- Real file storage (Cloudflare R2) — needed once file upload usage becomes real rather than demo-scale
- OCR / handwriting extraction for site visit notes — expect this to be unreliable even with good models; likely needs a human-review step, not full automation, for a while
- Satellite imagery lookup from a project's geolocation — needs a mapping/imagery API vendor decision; not yet clear which specific use case (site verification? access/terrain planning?) this serves, which should be nailed down before committing build time to it
