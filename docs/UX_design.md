# Design & UX Direction

This is a lightweight starting point, not a design system. Revisit and invest properly if the app gets traction — for now, the goal is: don't look like an unstyled template, and don't accidentally adopt the current AI-generated-design clichés (warm cream + terracotta, near-black + neon accent, broadsheet-with-hairlines). This is an internal operational tool, not a marketing site — no hero sections, no brand exploration needed yet.

## Approach
Tailwind CSS, with a small custom token set layered in rather than default Tailwind grays/blues — fast to build with, avoids looking generic if the tokens below are actually used consistently.

## Tokens

**Color**
- Background: `#F7F8F7` (cool near-white, not cream)
- Surface (cards/panels): `#FFFFFF`
- Text primary: `#1E2A32` (deep slate)
- Text secondary: `#5B6B73` (muted slate)
- Border/structural line: `#D8DEDF`
- Accent: `#E8871E` (safety amber — drawn from the industry itself, not a generic SaaS purple/blue; used sparingly for primary actions and to mark the agent's presence)

**Type**
- UI/body: a clean grotesque sans (`Inter`, or fall back to the system-ui stack) — legible at small sizes in data-dense views, no personality-heavy display face needed for an internal tool
- Numeric/data (rates, costs, measurements): a monospace (`IBM Plex Mono` or `ui-monospace` fallback) — signals "this is precise data" distinct from conversational text, and aligns cleanly in tables

## Layout concept
Two visually distinct registers, and the distinction is deliberate, not accidental: the conversation panel should feel conversational (looser rhythm, avatars/names, normal reading flow), while the project-definition panel should feel structured (tighter grid, labeled fields, monospace for numbers). The contrast between the two panels visually reinforces what the product actually does — turning conversation into structured data.

## Signature moment
When the agent updates a definition field from conversation, give that field a brief, deliberate visual acknowledgment (e.g. a short highlight/pulse on the field that just changed) — not decoration, information: it makes the core mechanic ("talking builds the project") visible and legible every time it happens, and it's the one thing worth spending real polish on this phase.

## Copy/voice
- Plain, active voice. A button that says "Save" produces a message that says "Saved" — not "Submit" → "Success."
- Empty states are direction, not mood: "Not yet configured — coming soon" tells someone what will eventually be here, not just that it's blank.
- No marketing tone anywhere in the app — this is a tool people use to get work done, not a product being sold to them within the UI itself.

## Explicitly deferred
- Logo/brand identity
- Illustration or icon system beyond an off-the-shelf icon set
- Any onboarding/marketing surfaces
- Accessibility beyond baseline (keyboard focus visible, reasonable contrast) — a real accessibility pass if this becomes a real product
