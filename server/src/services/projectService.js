import { pool } from '../db/pool.js';

// customer_name/customer_address are joined in for display and agent-context
// convenience -- the Customers CRUD UI (docs/requirements/customers.md) isn't
// built yet, so this keeps callers from needing their own join. customer_address
// is the customer's address on file, which for most of these jobs *is* the
// work site -- see docs/feedback/: no agent had this at all before, which is
// why "derive distance instead of asking" (an existing seeded procedural
// rule) was never actually satisfiable.
//
// resolved_job_site_address is the one field every caller (agents, PDF,
// UI) should actually read for "where is the work happening" -- it's the
// customer's address unless the project explicitly overrides it via the
// Details tab's same-as-customer toggle. Resolving it here, once, means no
// caller has to re-implement the fallback or (as happened before) rely on
// an agent inferring an override from freeform narrative text.
const SELECT_WITH_CUSTOMER = `
  SELECT p.*, c.name AS customer_name, c.address AS customer_address,
    CASE WHEN p.job_site_same_as_customer THEN c.address ELSE p.job_site_address END
      AS resolved_job_site_address
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

// Full-replace update, matching customerService.updateCustomer's convention.
// jobSiteAddress is only persisted meaningfully when jobSiteSameAsCustomer is
// false, but it's stored either way so a human can flip the toggle back and
// forth without retyping the override address.
export async function updateProjectDetails(id, { name, customerId = null, status = '', jobSiteSameAsCustomer = true, jobSiteAddress = '' }) {
  const { rows } = await pool.query(
    `UPDATE projects
     SET name = $2, customer_id = $3, status = $4, job_site_same_as_customer = $5, job_site_address = $6, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, name, customerId, status, jobSiteSameAsCustomer, jobSiteAddress]
  );
  return rows[0] || null;
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
