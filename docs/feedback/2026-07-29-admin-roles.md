# Admin roles (isAdmin) — build notes

Built against `requirements/auth.md` (build priority #1).

## What shipped
- `users.role` (free text, never actually enforced) replaced with `is_admin` and `is_active` booleans. Deactivation is a flag, not a delete, so `created_by` history on projects/messages/etc. stays intact.
- `requireAdmin` middleware (replaces the unused `requireRole` placeholder), enforced server-side on:
  - `GET/POST/PUT /api/users` — non-admins get a 403, and (since the route requires auth+admin at the router mount) can't see the list at all, not just edit it.
  - `PUT /api/company-info/:sectionKey` (Identity/Products/Assets/Employee Base freeform edits, and the two now-structured-elsewhere rate card sections' section-level content).
  - `POST/PUT/DELETE /api/company-info/:sectionKey/items` (the rate card rows added last session).
  - `cost` is stripped from `GET /api/company-info/:sectionKey/items` for non-admins at the route layer — not a UI-only hide.
- Deactivated users get the same generic "Invalid email or password" on login as a wrong password would — doesn't leak account state.
- Client: new admin-only **Users** page (list, add, toggle admin, deactivate/reactivate), nav item hidden for non-admins, `/users` route redirects non-admins away even if linked directly. Company Info page's Save button and textarea are now read-only for non-admins (server already rejected the write; this just stops offering it).

## Decisions made without asking
- **Who gets admin on the real (non-demo) accounts**: production has two real logins beyond the demo set — `karl.zimmer@enterpriseedge.com` (you) and `shawn@coforearth.com`. I granted admin to `admin@cfe.demo` and to you, and left `shawn@coforearth.com` as a regular user. Flagging in case that's wrong — one click in the new Users page (or another run of `server/src/db/grant-admins.js` with the email added) fixes it either way.
- Kept the migration additive where possible: existing users aren't reseeded/wiped (even though that was pre-authorized) — just an `ALTER ADD COLUMN` + a one-off `grant-admins.js` script to flip the two known accounts. Simpler and non-destructive achieves the same result.

## Known gaps
- No password reset / self-service signup — matches auth.md, not an oversight.
- The rate card `cost`-stripping is enforced, but there's still no UI that displays rate card items at all (Company Info page only shows the freeform sections) — that's `company-info.md`'s "Company Info restructure" (#2), not built this pass.
- `requireAdmin` doesn't re-check `is_active` mid-token-lifetime — a deactivated user's still-valid JWT (up to 12h TTL) keeps working until it expires. Acceptable for a prototype; would need session invalidation or a shorter TTL to close for real.
