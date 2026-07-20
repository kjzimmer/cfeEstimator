// Storage abstraction. This phase: bytes live directly in the `files` table
// in Postgres. Swap this module's internals for a Cloudflare R2 client later
// -- call sites (fileService.js) shouldn't need to change.
// TODO: needs test
import { pool } from '../db/pool.js';

export async function put({ projectId, filename, mimeType, buffer, uploadedBy }) {
  const { rows } = await pool.query(
    `INSERT INTO files (project_id, filename, mime_type, size_bytes, data, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, project_id, filename, mime_type, size_bytes, uploaded_by, created_at`,
    [projectId, filename, mimeType, buffer.length, buffer, uploadedBy]
  );
  return rows[0];
}

export async function get(fileId) {
  const { rows } = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
  return rows[0] || null;
}

export async function list(projectId) {
  const { rows } = await pool.query(
    `SELECT id, project_id, filename, mime_type, size_bytes, uploaded_by, created_at
     FROM files WHERE project_id = $1 ORDER BY created_at DESC`,
    [projectId]
  );
  return rows;
}
