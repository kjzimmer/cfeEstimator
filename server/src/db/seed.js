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

// Plausible-but-fictional example rows -- structured per docs/requirements/company-info.md
// ({ name, unit, rate, cost }). Only seeded when the table is empty, so this
// doesn't clobber real data on repeat runs -- see db/reseed-rate-cards.js for
// a destructive reseed.
const SERVICE_RATE_EXAMPLES = [
  { name: 'Excavation - Standard Dig', unit: 'hr', rate: 185, cost: 110 },
  { name: 'Trenching', unit: 'linear ft', rate: 12, cost: 7 },
  { name: 'Grading & Site Prep', unit: 'hr', rate: 165, cost: 95 },
  { name: 'Demolition', unit: 'hr', rate: 195, cost: 120 },
  { name: 'Land Clearing', unit: 'acre', rate: 2200, cost: 1400 },
  { name: 'Utility Line Installation', unit: 'linear ft', rate: 18, cost: 11 },
  { name: 'Septic System Installation', unit: 'job', rate: 8500, cost: 5200 },
  { name: 'Erosion Control / Silt Fencing', unit: 'linear ft', rate: 4.5, cost: 2.75 },
];

const MATERIAL_COST_EXAMPLES = [
  { name: 'Crushed Stone (3/4")', unit: 'ton', rate: 42, cost: 28 },
  { name: 'Topsoil', unit: 'cubic yd', rate: 38, cost: 24 },
  { name: 'Sand (fill)', unit: 'ton', rate: 26, cost: 17 },
  { name: 'Gravel (road base)', unit: 'ton', rate: 34, cost: 22 },
  { name: 'Concrete (ready mix)', unit: 'cubic yd', rate: 165, cost: 125 },
  { name: 'Culvert Pipe (18in HDPE)', unit: 'linear ft', rate: 32, cost: 21 },
  { name: 'Silt Fence Fabric', unit: 'linear ft', rate: 2.25, cost: 1.4 },
  { name: 'Rip Rap', unit: 'ton', rate: 48, cost: 33 },
];

async function seedRateCardExamples(table, rows) {
  const { rows: existing } = await pool.query(`SELECT 1 FROM ${table} LIMIT 1`);
  if (existing.length > 0) return;
  for (const r of rows) {
    await pool.query(
      `INSERT INTO ${table} (name, unit, rate, cost) VALUES ($1, $2, $3, $4)`,
      [r.name, r.unit, r.rate, r.cost]
    );
  }
}

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

  await seedRateCardExamples('service_rate_items', SERVICE_RATE_EXAMPLES);
  await seedRateCardExamples('material_cost_items', MATERIAL_COST_EXAMPLES);

  console.log('Seeded demo users:');
  DEMO_USERS.forEach((u) => console.log(`  ${u.email} / ${u.password}`));
  console.log('Seeded company info section placeholders.');
  console.log('Seeded structured Service Rate / Material Cost examples (if tables were empty).');

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
