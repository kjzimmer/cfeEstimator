# Auth

- JWT, email/password
- `isAdmin` boolean on User (replaces the placeholder single-value `role` field from earlier — boolean is enough granularity for now; nothing stops this from becoming a fuller role system later if a third tier is ever needed)
- Admin-only capabilities, enforced server-side (never just hidden in the UI):
  - View and manage the user list (add/deactivate users) — non-admins cannot see the user list at all, not just edit it
  - Edit Company Info (Identity, Rate Cards, Materials, Assets) — see `company-info.md`
  - View cost and profit figures anywhere they appear (rate cards, work order internals) — see `company-info.md` and `work-orders.md`
- Non-admins: can view Company Info (rate/cost split applies — see `company-info.md`), cannot see the user list, cannot edit Company Info
- Seed script creates at least one admin and one non-admin demo login
- No password reset, no self-service signup this phase — admin adds users manually
