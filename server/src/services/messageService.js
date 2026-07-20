import { pool } from '../db/pool.js';

export async function listMessages(projectId) {
  const { rows } = await pool.query(
    `SELECT m.*, u.name AS user_name
     FROM messages m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.project_id = $1
     ORDER BY m.created_at ASC`,
    [projectId]
  );
  return rows;
}

export async function appendMessage({ projectId, senderType, userId = null, type = 'text', content, fileId = null }) {
  const { rows } = await pool.query(
    `WITH inserted AS (
       INSERT INTO messages (project_id, sender_type, user_id, type, content, file_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *
     )
     SELECT inserted.*, u.name AS user_name
     FROM inserted
     LEFT JOIN users u ON u.id = inserted.user_id`,
    [projectId, senderType, userId, type, content, fileId]
  );
  return rows[0];
}
