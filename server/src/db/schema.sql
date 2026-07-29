-- CFE Estimator schema
-- Flexible/evolving data (project definition, company info content) is stored as
-- JSON/text rather than rigid relational columns, per docs/coding-standards.md.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  -- Replaces the earlier placeholder `role` text field -- see docs/requirements/auth.md.
  -- A boolean is enough granularity for now; nothing stops this becoming a
  -- fuller role system later if a third tier is ever needed.
  is_admin      BOOLEAN NOT NULL DEFAULT false,
  -- Deactivated users are kept, not deleted, so history (created_by on
  -- projects/messages) stays intact -- see auth.md's "add/deactivate users".
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration for pre-existing databases: the CREATE TABLE above only takes
-- effect on a fresh install.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users DROP COLUMN IF EXISTS role;

CREATE TABLE IF NOT EXISTS company_info_sections (
  section_key TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Structured rate cards (docs/requirements/company-info.md): rows of
-- { name, unit, rate, cost }. rate = billed to customer, cost = internal.
-- Two tables (not one generic "rate_items" table) because Service Rates and
-- Material Costs are independently listed/edited sections in the UI.
CREATE TABLE IF NOT EXISTS service_rate_items (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL DEFAULT '',
  rate        NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost        NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS material_cost_items (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL DEFAULT '',
  rate        NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost        NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Structured customer records (docs/requirements/customers.md). Replaces
-- the old free-text Project.customer column -- see the migration below.
CREATE TABLE IF NOT EXISTS customers (
  id                    SERIAL PRIMARY KEY,
  name                  TEXT NOT NULL,
  address               TEXT NOT NULL DEFAULT '',
  primary_contact_name  TEXT NOT NULL DEFAULT '',
  phone                 TEXT NOT NULL DEFAULT '',
  email                 TEXT NOT NULL DEFAULT '',
  -- Freeform: customer notes are narrative, not computed. See company-info.md
  -- for the same structured/freeform split principle applied here.
  notes                 TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
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

-- Migration for pre-existing databases: the CREATE TABLE above only takes
-- effect on a fresh install. customer_id replaces the old free-text
-- `customer` column -- see docs/requirements/customers.md.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
ALTER TABLE projects DROP COLUMN IF EXISTS customer;

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
