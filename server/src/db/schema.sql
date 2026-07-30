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

-- Freeform Company Info sections only (Products & Services, Employee Base
-- general notes) -- structured sections each get their own table below.
-- See docs/requirements/company-info.md.
CREATE TABLE IF NOT EXISTS company_info_sections (
  section_key TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cleanup for pre-existing databases: identity/assets/service_rates/
-- material_costs used to live here as freeform rows before being split into
-- their own structured tables. No-op once already cleaned up.
DELETE FROM company_info_sections WHERE section_key IN ('identity', 'assets', 'service_rates', 'material_costs');

-- Single-record company identity -- exactly what appears in a work order
-- header. id is pinned to 1 (CHECK) since there's only ever one row.
CREATE TABLE IF NOT EXISTS company_identity (
  id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name  TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  website       TEXT NOT NULL DEFAULT '',
  updated_by    INTEGER REFERENCES users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO company_identity (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Structured rate cards (docs/requirements/company-info.md): rows of
-- { name, unit, rate, cost }. rate = billed to customer, cost = internal.
-- Four tables (not one generic "rate_items" table) because each card is an
-- independently listed/edited section in the UI.
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

-- Equipment/Asset Rate Card -- unit is typically hr/day.
CREATE TABLE IF NOT EXISTS equipment_rate_items (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL DEFAULT '',
  rate        NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost        NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Employee Role Rate Card -- rate by role (e.g. "Laborer", "Operator"), not
-- a named staffing roster. Distinct from the freeform Employee Base notes.
CREATE TABLE IF NOT EXISTS employee_role_rate_items (
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
  -- Small fixed set, not open-ended -- see docs/requirements/project-documents.md.
  type        TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('site-note', 'photo', 'work-order', 'other')),
  -- How the file entered the system: attached in chat, uploaded directly via
  -- the Documents tab, or system-generated (e.g. a future work order PDF).
  source      TEXT NOT NULL DEFAULT 'chat' CHECK (source IN ('chat', 'direct', 'system')),
  uploaded_by INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration for pre-existing databases: the CREATE TABLE above only takes
-- effect on a fresh install. Existing rows predate both columns and were
-- all chat uploads (the only path that existed), so 'chat'/'other' as
-- defaults backfill correctly, not just for new rows.
ALTER TABLE files ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('site-note', 'photo', 'work-order', 'other'));
ALTER TABLE files ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'chat' CHECK (source IN ('chat', 'direct', 'system'));

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
