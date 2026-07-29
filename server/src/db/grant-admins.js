// One-off maintenance script: the users.role -> is_admin/is_active migration
// (schema.sql) defaults every existing user to is_admin = false. This grants
// admin on the known accounts that need it post-migration. Idempotent --
// safe to re-run. Extend ADMIN_EMAILS if another account needs promoting.
//
// Usage: node src/db/grant-admins.js
import 'dotenv/config';
import { pool } from './pool.js';

const ADMIN_EMAILS = ['admin@cfe.demo', 'karl.zimmer@enterpriseedge.com'];

async function run() {
  for (const email of ADMIN_EMAILS) {
    const { rows } = await pool.query(
      `UPDATE users SET is_admin = true WHERE email = $1 RETURNING email, name`,
      [email]
    );
    if (rows[0]) {
      console.log(`Granted admin: ${rows[0].email} (${rows[0].name})`);
    } else {
      console.log(`No user found for ${email} -- skipped.`);
    }
  }
  await pool.end();
}

run().catch((err) => {
  console.error('Grant admins failed:', err);
  process.exit(1);
});
