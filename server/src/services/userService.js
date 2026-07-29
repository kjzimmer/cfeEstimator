import { pool } from '../db/pool.js';

const PUBLIC_COLUMNS = 'id, email, name, is_admin, is_active, created_at';

export async function findUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] || null;
}

export async function findUserById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function createUser({ email, passwordHash, name, isAdmin = false }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, is_admin)
     VALUES ($1, $2, $3, $4)
     RETURNING ${PUBLIC_COLUMNS}`,
    [email, passwordHash, name, isAdmin]
  );
  return rows[0];
}

// User list/management is admin-only (docs/requirements/auth.md) --
// password_hash is never returned here.
export async function listUsers() {
  const { rows } = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY name`);
  return rows;
}

export async function updateUser(id, { name, isAdmin, isActive }) {
  const { rows } = await pool.query(
    `UPDATE users
     SET name = $2, is_admin = $3, is_active = $4
     WHERE id = $1
     RETURNING ${PUBLIC_COLUMNS}`,
    [id, name, isAdmin, isActive]
  );
  return rows[0] || null;
}
