import { pool } from '../db/pool.js';

export async function listCustomers() {
  const { rows } = await pool.query('SELECT * FROM customers ORDER BY name');
  return rows;
}

export async function getCustomer(id) {
  const { rows } = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function createCustomer({
  name,
  address = '',
  primaryContactName = '',
  phone = '',
  email = '',
  notes = '',
}) {
  const { rows } = await pool.query(
    `INSERT INTO customers (name, address, primary_contact_name, phone, email, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, address, primaryContactName, phone, email, notes]
  );
  return rows[0];
}

export async function updateCustomer(id, { name, address = '', primaryContactName = '', phone = '', email = '', notes = '' }) {
  const { rows } = await pool.query(
    `UPDATE customers
     SET name = $2, address = $3, primary_contact_name = $4, phone = $5, email = $6, notes = $7, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, name, address, primaryContactName, phone, email, notes]
  );
  return rows[0] || null;
}

// A customer's project history -- see docs/requirements/customers.md
// ("Customer detail view shows the customer's project history").
export async function listCustomerProjects(id) {
  const { rows } = await pool.query(
    'SELECT * FROM projects WHERE customer_id = $1 ORDER BY updated_at DESC',
    [id]
  );
  return rows;
}
