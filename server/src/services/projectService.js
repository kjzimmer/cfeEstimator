import { pool } from '../db/pool.js';

export async function listProjects({ historical } = {}) {
  if (historical === undefined) {
    const { rows } = await pool.query('SELECT * FROM projects ORDER BY updated_at DESC');
    return rows;
  }
  const { rows } = await pool.query(
    'SELECT * FROM projects WHERE historical = $1 ORDER BY updated_at DESC',
    [historical]
  );
  return rows;
}

export async function getProject(id) {
  const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function createProject({ name, customer = '', status = '', historical = false, createdBy }) {
  const { rows } = await pool.query(
    `INSERT INTO projects (name, customer, status, historical, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, customer, status, historical, createdBy]
  );
  return rows[0];
}

// Merges a single component (e.g. "sow", "location") into the project's
// definition JSON blob. New component keys can appear without a migration --
// see docs/requirements/projects.md.
export async function updateDefinitionComponent(projectId, componentKey, content) {
  const { rows } = await pool.query(
    `UPDATE projects
     SET definition = jsonb_set(definition, ARRAY[$2::text], to_jsonb($3::text), true),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [projectId, componentKey, content]
  );
  return rows[0] || null;
}
