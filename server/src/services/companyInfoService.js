import { pool } from '../db/pool.js';

export async function listSections() {
  const { rows } = await pool.query(
    'SELECT * FROM company_info_sections ORDER BY section_key'
  );
  return rows;
}

export async function getSection(sectionKey) {
  const { rows } = await pool.query(
    'SELECT * FROM company_info_sections WHERE section_key = $1',
    [sectionKey]
  );
  return rows[0] || null;
}

export async function updateSection(sectionKey, content, userId) {
  const { rows } = await pool.query(
    `UPDATE company_info_sections
     SET content = $2, updated_by = $3, updated_at = now()
     WHERE section_key = $1
     RETURNING *`,
    [sectionKey, content, userId]
  );
  return rows[0] || null;
}
