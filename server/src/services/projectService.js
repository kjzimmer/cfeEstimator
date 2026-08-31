import { pool } from '../db/pool.js';

// customer_name/customer_address are joined in for display and agent-context
// convenience -- the Customers CRUD UI (docs/requirements/customers.md) isn't
// built yet, so this keeps callers from needing their own join. customer_address
// is the customer's address on file, which for most of these jobs *is* the
// work site -- see docs/feedback/: no agent had this at all before, which is
// why "derive distance instead of asking" (an existing seeded procedural
// rule) was never actually satisfiable. The project's own `location`
// definition component, once a human states it, is the more specific/
// authoritative site address if it differs from the customer's address on file.
const SELECT_WITH_CUSTOMER = `
  SELECT p.*, c.name AS customer_name, c.address AS customer_address
  FROM projects p
  LEFT JOIN customers c ON c.id = p.customer_id
`;

export async function listProjects({ historical } = {}) {
  if (historical === undefined) {
    const { rows } = await pool.query(`${SELECT_WITH_CUSTOMER} ORDER BY p.updated_at DESC`);
    return rows;
  }
  const { rows } = await pool.query(
    `${SELECT_WITH_CUSTOMER} WHERE p.historical = $1 ORDER BY p.updated_at DESC`,
    [historical]
  );
  return rows;
}

export async function getProject(id) {
  const { rows } = await pool.query(`${SELECT_WITH_CUSTOMER} WHERE p.id = $1`, [id]);
  return rows[0] || null;
}

export async function createProject({ name, customerId = null, status = '', historical = false, createdBy }) {
  const { rows } = await pool.query(
    `INSERT INTO projects (name, customer_id, status, historical, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, customerId, status, historical, createdBy]
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
