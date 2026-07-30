// Storage abstraction. This phase: bytes live directly in the `files` table
// in Postgres. Swap this module's internals for a Cloudflare R2 client later
// -- call sites (fileService.js) shouldn't need to change.
// TODO: needs test
import { pool } from '../db/pool.js';

export async function put({ projectId, filename, mimeType, buffer, uploadedBy, type = 'other', source = 'chat' }) {
  const { rows } = await pool.query(
    `INSERT INTO files (project_id, filename, mime_type, size_bytes, data, uploaded_by, type, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, project_id, filename, mime_type, size_bytes, uploaded_by, type, source, created_at`,
    [projectId, filename, mimeType, buffer.length, buffer, uploadedBy, type, source]
  );
  return rows[0];
}

export async function get(fileId) {
  const { rows } = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
  return rows[0] || null;
}

export async function list(projectId) {
  const { rows } = await pool.query(
    `SELECT f.id, f.project_id, f.filename, f.mime_type, f.size_bytes, f.uploaded_by, f.type, f.source, f.created_at,
            u.name AS uploaded_by_name
     FROM files f
     LEFT JOIN users u ON u.id = f.uploaded_by
     WHERE f.project_id = $1
     ORDER BY f.created_at DESC`,
    [projectId]
  );
  return rows;
}
