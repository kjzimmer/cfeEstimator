# CFE Estimator

See `CLAUDE.md` and `docs/` for what this is and why. This file is just local setup.

## Setup

```
npm run install:all
cp server/.env.example server/.env   # fill in DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY
npm run db:migrate
npm run db:seed
```

Seed creates three demo logins (`estimator@cfe.demo`, `pm@cfe.demo`, `admin@cfe.demo`, all password `demo1234`).

## Run

```
npm run dev
```

Server on `:3001` (or `PORT` from `server/.env`), client on `:5173` (Vite dev server, proxies `/api` to the server). Open the client URL and log in with a seed account.
