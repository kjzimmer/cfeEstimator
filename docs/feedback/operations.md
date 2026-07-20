# Operations & Deployment

Deploy/infra/ops knowledge for CFE Estimator — distinct from `coding-standards.md` (code conventions) and `requirements/` (product spec). This doc is where "how do we run and ship this" lives, so it doesn't have to be rediscovered per deploy or per project.

## Environments

- **Local dev**: `npm run dev` at repo root (client + server via `concurrently`), against a local Postgres instance. See root `README.md` for setup steps.
- **Production**: Railway, single service (`cfeEstimator`) serving both the API and the built React client, plus a Postgres addon. Public URL: the service's Railway-assigned domain.
- **Planned, not yet built**: a dev → staging → production sequence. Not needed at current scale, but when it's introduced, define here: how each stage maps to Railway environments/services, how a change is promoted between them (branch-based? manual promotion? environment cloning?), and what differs per environment (separate Anthropic key, separate DB, etc.). This section is a placeholder for that decision.

## Build system: Nixpacks, not Railpack

Railway offers two builders. This project uses **Nixpacks** via a `railway.json` config, not Railway's newer **Railpack** builder. This was an empirical finding, not a permanent constraint — worth revisiting if Railpack matures.

What happened: Railpack's `deploy` stage uses a stripped runtime image. Once we defined a custom `deploy` section in `railpack.json` (to fix an unrelated devDependency issue), that runtime image didn't reliably include `node`/`npm` — two consecutive deploys 502'd with "command not found" for each in turn. Switching to Nixpacks via `railway.json` (confirmed working on another project with the same client/server monorepo shape) resolved it immediately — Nixpacks keeps the full toolchain available at runtime.

## Monorepo build pattern

`client/` and `server/` each have their own `package.json`; there are no npm workspaces. Root `package.json` orchestrates via `--prefix`:

```
"build": handled by railway.json's buildCommand:
  npm install --prefix server && npm install --prefix client && npm run build --prefix client
"start": npm start --prefix server
```

**Build-time tools must be in `dependencies`, not `devDependencies`, in `client/package.json`.** Nixpacks (and Railpack) install with `NODE_ENV=production`, which skips `devDependencies` — but `vite`, `@vitejs/plugin-react`, `tailwindcss`, and `@tailwindcss/vite` are required to *build* the client, not just for local dev. The fix is structural (move them to `dependencies`), not an environment-variable workaround (`NPM_CONFIG_PRODUCTION=false`) — the latter works but shouldn't be relied on long-term.

## Node version pinning

All three `package.json` files (root, `client/`, `server/`) declare:
```json
"engines": { "node": "20.x" }
```
This mattered because `@tailwindcss/oxide` (Tailwind v4's native binding) requires Node ≥20. Without pinning, Nixpacks defaulted to an older Node (18.20.5 was observed), and the native binding failed to load, crashing `vite build` with a cryptic "Cannot find native binding" error rather than an obvious version mismatch message.

## Required environment variables

Set on the Railway service (names only — see `server/.env.example` for the local equivalent):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (Railway injects this automatically when the Postgres addon is attached) |
| `JWT_SECRET` | Signs auth tokens — a missing value crashes login with `secretOrPrivateKey must have a value` |
| `ANTHROPIC_API_KEY` | Agent's Claude API access — an invalid/revoked key surfaces as a 500 on any message post, with `AuthenticationError: 401` in the logs |
| `NODE_ENV` | Must be `production` — without it, Express never serves the built client, only the `/api` routes |
| `PORT` | Set automatically by Railway; the app reads `process.env.PORT` |

All three of the first variables have caused a production outage at least once during initial setup (missing DB creds, missing JWT secret, stale Anthropic key after rotation) — worth a pre-deploy checklist confirming all are set whenever a fresh environment is provisioned.

## Reaching the production DB directly

`DATABASE_URL`'s host (`postgres.railway.internal`) only resolves inside Railway's private network — it will not work from a local machine, even with `railway run` injecting the correct variables (that only injects env vars, it doesn't tunnel network access).

For one-off scripts (migrations, seeding) run locally against production: use Railway's Postgres **public TCP proxy** (host:port shown on the Postgres service's dashboard/Variables) in place of the internal host, keeping the same user/password/database name. `railway run node <script>` still applies for env var injection; just override the host:port before connecting.

## Debugging a bad deploy

Two different log streams, and a failure can originate in either:
- `railway logs --build --latest` — the actual build process. This is where we caught both the devDependency issue and the Node-version mismatch.
- `railway logs` (runtime/application logs) — this is where we caught missing env vars and the Railpack node/npm-not-found issue.

A "502 / Application Failed to Respond" doesn't tell you which stage failed — check build logs first if the deploy status shows a build failure; check runtime logs if the build succeeded but the app won't respond.

## Secrets handling

Never print a full secret value in shared/logged output (chat transcripts, CI logs, etc.) — when confirming a variable is set correctly, mask to the last few characters only. This project had two near-misses where a careless command (`grep` matching too broadly) printed a full API key and a full DB connection string to a conversation transcript; both required rotating the exposed credential.
