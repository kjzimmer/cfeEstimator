# Auth

- JWT, email/password
- Single `role` field on User, only one value in use today, but present in the schema and read wherever a role check would go — so adding roles later is a config change, not a rewrite
- Seed script creates 2–3 demo logins
- No password reset, no admin user-management UI this phase
