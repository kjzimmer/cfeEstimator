import { pool } from '../db/pool.js';

export async function getIdentity() {
  const { rows } = await pool.query('SELECT * FROM company_identity WHERE id = 1');
  return rows[0];
}

export async function updateIdentity({ companyName, address, phone, email, website }, userId) {
  const { rows } = await pool.query(
    `UPDATE company_identity
     SET company_name = $1, address = $2, phone = $3, email = $4, website = $5,
         updated_by = $6, updated_at = now()
     WHERE id = 1
     RETURNING *`,
    [companyName, address, phone, email, website, userId]
  );
  return rows[0];
}
