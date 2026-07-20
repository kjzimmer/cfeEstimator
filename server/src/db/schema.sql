-- CFE Estimator schema
-- Flexible/evolving data (project definition, company info content) is stored as
-- JSON/text rather than rigid relational columns, per docs/coding-standards.md.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'employee',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_info_sections (
  section_key TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  customer    TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT '',
  historical  BOOLEAN NOT NULL DEFAULT false,
  -- Project definition: JSON blob keyed by component name (sow, location,
  -- materials, assets, labor, billing, siteVisit, ...). New keys can appear
  -- without a migration -- see docs/requirements/projects.md.
  definition  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS files (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  -- Stored directly in Postgres this phase; swap to Cloudflare R2 later via
  -- the storage.js abstraction without touching call sites.
  data        BYTEA NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'agent')),
  user_id     INTEGER REFERENCES users(id),
  -- text | file | audio -- audio unused this phase, kept so the model
  -- doesn't need a rewrite when audio input lands. See agent-sidebar.md.
  type        TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'file', 'audio')),
  content     TEXT NOT NULL DEFAULT '',
  file_id     INTEGER REFERENCES files(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_project_id ON messages(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);
