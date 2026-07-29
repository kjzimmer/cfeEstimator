// One-off maintenance script: creates the Willow Creek Farms Customer record
// and links it to the existing "Willow Creek" example project, per
// docs/requirements/customers.md. Idempotent -- safe to re-run.
//
// Usage: node src/db/seed-willow-creek-customer.js
import 'dotenv/config';
import { pool } from './pool.js';

const CUSTOMER = {
  name: 'Willow Creek Farms',
  address: '4820 County Road 12, Willow Creek, TX 78933',
  primary_contact_name: 'Dale Harmon',
  phone: '(512) 555-0148',
  email: 'dale.harmon@willowcreekfarms.example',
  notes: 'Fictional example customer for demo purposes.',
};

async function findOrCreateCustomer() {
  const { rows: existing } = await pool.query('SELECT * FROM customers WHERE name = $1', [CUSTOMER.name]);
  if (existing[0]) return existing[0];

  const { rows } = await pool.query(
    `INSERT INTO customers (name, address, primary_contact_name, phone, email, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [CUSTOMER.name, CUSTOMER.address, CUSTOMER.primary_contact_name, CUSTOMER.phone, CUSTOMER.email, CUSTOMER.notes]
  );
  return rows[0];
}

async function findExampleProject() {
  // Prefer an exact match on the known example project name (see
  // docs/feedback/2026-07-29-session-wrap-up.md) over a fuzzy ILIKE, since
  // more than one "Willow Creek..." project can exist (e.g. ad hoc test copies).
  const { rows: exact } = await pool.query(
    `SELECT * FROM projects WHERE name = 'Willow Creek Pole Barn' ORDER BY created_at ASC LIMIT 1`
  );
  if (exact[0]) return exact[0];

  const { rows: fuzzy } = await pool.query(
    `SELECT * FROM projects WHERE name ILIKE '%willow creek%' ORDER BY created_at ASC LIMIT 1`
  );
  if (fuzzy[0]) return fuzzy[0];

  const { rows: anyProject } = await pool.query('SELECT * FROM projects ORDER BY created_at ASC LIMIT 1');
  return anyProject[0] || null;
}

async function createExampleProject() {
  const { rows: adminRows } = await pool.query(
    `SELECT id FROM users WHERE email = 'admin@cfe.demo' LIMIT 1`
  );
  const { rows: anyUser } = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
  const createdBy = adminRows[0]?.id ?? anyUser[0]?.id ?? null;

  const { rows } = await pool.query(
    `INSERT INTO projects (name, status, historical, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    ['Willow Creek Pole Barn', 'Estimating', false, createdBy]
  );
  return rows[0];
}

async function run() {
  const customer = await findOrCreateCustomer();
  console.log(`Customer "${customer.name}" (id ${customer.id}) ready.`);

  let project = await findExampleProject();
  if (!project) {
    project = await createExampleProject();
    console.log(`No existing project found -- created "${project.name}" (id ${project.id}).`);
  }

  await pool.query('UPDATE projects SET customer_id = $2, updated_at = now() WHERE id = $1', [
    project.id,
    customer.id,
  ]);
  console.log(`Linked project "${project.name}" (id ${project.id}) to customer "${customer.name}".`);

  await pool.end();
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
