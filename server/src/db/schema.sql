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

-- Work Orders (docs/requirements/work-orders.md). draft -> finalized is
-- one-way; "editing" a finalized work order means creating a new revision
-- (a new row), not mutating this one -- see work_order_line_items.cost note
-- below for the other key invariant (the cost/PDF firewall).
CREATE TABLE IF NOT EXISTS work_orders (
  id                    SERIAL PRIMARY KEY,
  project_id            INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision              INTEGER NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  scope_text            TEXT NOT NULL DEFAULT '',
  site_location         TEXT NOT NULL DEFAULT '',
  -- Freeform (e.g. "Week of August 11, 2026") -- not a real schedule/
  -- calendar feature, just a line on the PDF. See the PDF header layout.
  requested_start       TEXT NOT NULL DEFAULT '',
  contingency_percent   NUMERIC(5,2) NOT NULL DEFAULT 0,
  terms                 TEXT NOT NULL DEFAULT '',
  -- Set at finalize time -- the generated PDF, saved as a Project Document
  -- (files.type = 'work-order', files.source = 'system').
  file_id               INTEGER REFERENCES files(id),
  created_by            INTEGER REFERENCES users(id),
  finalized_by          INTEGER REFERENCES users(id),
  finalized_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, revision)
);

-- Migration for pre-existing databases.
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS requested_start TEXT NOT NULL DEFAULT '';

-- At most one draft per project at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_orders_one_draft_per_project
  ON work_orders(project_id) WHERE status = 'draft';

CREATE TABLE IF NOT EXISTS work_order_line_items (
  id              SERIAL PRIMARY KEY,
  work_order_id   INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  -- Which rate card this was added from, if any -- NULL for a manually
  -- typed line with no backing rate-card entry.
  rate_card_type  TEXT CHECK (rate_card_type IN ('service_rates', 'material_costs', 'equipment_rates', 'employee_role_rates')),
  name            TEXT NOT NULL,
  unit            TEXT NOT NULL DEFAULT '',
  qty             NUMERIC(12,2) NOT NULL DEFAULT 1,
  -- Nullable: rates only ever come from a rate card, never freehand entry
  -- by anyone (docs/feedback/2026-08-13-rate-card-authority-gap.md). NULL
  -- means unresolved -- no matching rate card entry exists yet. Finalize
  -- blocks while any line item is unresolved; drafting/scoping does not.
  rate            NUMERIC(12,2),
  -- Captured server-side from the source rate card at add-time (never
  -- client-supplied), nullable for manual lines. This column exists so the
  -- admin-only profit view can work -- the PDF-generation query is a
  -- separate, dedicated SELECT that never includes this column. That's the
  -- actual guardrail from work-orders.md: not "has cost but doesn't render
  -- it," structurally absent from the query the PDF path runs.
  cost            NUMERIC(12,2),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration for pre-existing databases: the CREATE TABLE above only takes
-- effect on a fresh install. Existing rows keep whatever rate they have --
-- no backfill/migration of already-finalized work orders under the old
-- freehand-rate behavior, per the rate-authority proposal's resolved
-- open question.
ALTER TABLE work_order_line_items ALTER COLUMN rate DROP NOT NULL;
ALTER TABLE work_order_line_items ALTER COLUMN rate DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_work_orders_project_id ON work_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_work_order_line_items_work_order_id ON work_order_line_items(work_order_id);

-- Agent Memory, Phase 1 (docs/requirements/agent-memory.md). Company-wide,
-- not per-project -- deliberately no project_id here. Two tables because
-- procedural ("how to behave") and semantic ("what's true about the domain")
-- have different lifecycles; see the doc's "Principle" section for why they
-- aren't conflated into one.
CREATE TABLE IF NOT EXISTS procedural_memory (
  id           SERIAL PRIMARY KEY,
  instruction  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'active', 'retired')),
  -- agent_proposed is a valid value but nothing writes it this phase --
  -- proactive capture is explicitly out of scope for Phase 1.
  source       TEXT NOT NULL CHECK (source IN ('human_seeded', 'human_asserted', 'agent_proposed')),
  proposed_by  INTEGER REFERENCES users(id),
  reviewed_by  INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at  TIMESTAMPTZ
);

-- 'proposed' and 'hypothesis' both exist on the status CHECK even though
-- Phase 1 only ever produces 'proposed' (via the intake tool) and promotes
-- straight to 'confirmed' on accept, skipping 'hypothesis' entirely (see the
-- doc's "Flagged decision" note). 'hypothesis' is reserved for Phase 2's
-- rationale-driven agent_inferred path, which writes directly into this same
-- table without going through the Phase 1 proposal queue -- kept valid now
-- so Phase 2 doesn't need a migration to add it.
CREATE TABLE IF NOT EXISTS semantic_memory (
  id            SERIAL PRIMARY KEY,
  content       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'hypothesis', 'confirmed', 'retired')),
  -- Distinct from Phase 3's import-provenance `origin` (imported/native) on a
  -- different table -- same field name, unrelated meaning. See the doc.
  origin        TEXT NOT NULL CHECK (origin IN ('human_asserted', 'agent_inferred')),
  source_refs   JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence      JSONB NOT NULL DEFAULT '[]'::jsonb,
  proposed_by   INTEGER REFERENCES users(id),
  reviewed_by   INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at   TIMESTAMPTZ,
  confirmed_at  TIMESTAMPTZ,
  confirmed_via TEXT
);

CREATE INDEX IF NOT EXISTS idx_procedural_memory_status ON procedural_memory(status);
CREATE INDEX IF NOT EXISTS idx_semantic_memory_status ON semantic_memory(status);
