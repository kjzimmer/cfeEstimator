import 'dotenv/config';
import { pool } from './pool.js';
import { hashPassword } from '../utils/auth.js';

const DEMO_USERS = [
  { email: 'estimator@cfe.demo', password: 'demo1234', name: 'Sam Estimator', role: 'employee' },
  { email: 'pm@cfe.demo', password: 'demo1234', name: 'Jordan PM', role: 'employee' },
  { email: 'admin@cfe.demo', password: 'demo1234', name: 'Alex Admin', role: 'employee' },
];

const COMPANY_INFO_SECTIONS = [
  { section_key: 'identity', title: 'Identity' },
  { section_key: 'products_services', title: 'Products & Services' },
  { section_key: 'assets', title: 'Assets' },
  { section_key: 'employee_base', title: 'Employee Base' },
  { section_key: 'service_rates', title: 'Service Rates' },
  { section_key: 'material_costs', title: 'Material Costs' },
];

async function seed() {
  for (const u of DEMO_USERS) {
    const passwordHash = await hashPassword(u.password);
    await pool.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [u.email, passwordHash, u.name, u.role]
    );
  }

  for (const s of COMPANY_INFO_SECTIONS) {
    await pool.query(
      `INSERT INTO company_info_sections (section_key, title, content)
       VALUES ($1, $2, '')
       ON CONFLICT (section_key) DO NOTHING`,
      [s.section_key, s.title]
    );
  }

  console.log('Seeded demo users:');
  DEMO_USERS.forEach((u) => console.log(`  ${u.email} / ${u.password}`));
  console.log('Seeded company info section placeholders.');

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
