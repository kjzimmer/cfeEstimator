import 'dotenv/config';
import { pool } from './pool.js';
import { hashPassword } from '../utils/auth.js';

const DEMO_USERS = [
  { email: 'estimator@cfe.demo', password: 'demo1234', name: 'Sam Estimator', isAdmin: false },
  { email: 'pm@cfe.demo', password: 'demo1234', name: 'Jordan PM', isAdmin: false },
  { email: 'admin@cfe.demo', password: 'demo1234', name: 'Alex Admin', isAdmin: true },
];

// Freeform sections only -- Identity and the four rate cards are structured
// tables now, seeded separately below. See docs/requirements/company-info.md.
const COMPANY_INFO_SECTIONS = [
  { section_key: 'products_services', title: 'Products & Services' },
  { section_key: 'employee_base', title: 'Employee Base' },
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

const EQUIPMENT_RATE_EXAMPLES = [
  { name: 'Mini Excavator (Cat 305)', unit: 'day', rate: 650, cost: 420 },
  { name: 'Standard Excavator (Cat 320)', unit: 'day', rate: 950, cost: 640 },
  { name: 'Skid Steer', unit: 'day', rate: 380, cost: 240 },
  { name: 'Dump Truck (10 yd)', unit: 'hr', rate: 95, cost: 60 },
  { name: 'Compactor / Plate Tamper', unit: 'day', rate: 120, cost: 75 },
  { name: 'Bulldozer (D5)', unit: 'day', rate: 1100, cost: 750 },
  { name: 'Grader', unit: 'day', rate: 900, cost: 610 },
  { name: 'Trencher', unit: 'day', rate: 420, cost: 270 },
];

const EMPLOYEE_ROLE_RATE_EXAMPLES = [
  { name: 'Laborer', unit: 'hr', rate: 55, cost: 32 },
  { name: 'Equipment Operator', unit: 'hr', rate: 85, cost: 52 },
  { name: 'Crew Foreman', unit: 'hr', rate: 110, cost: 68 },
  { name: 'Site Estimator', unit: 'hr', rate: 125, cost: 78 },
  { name: 'CDL Driver', unit: 'hr', rate: 75, cost: 46 },
  { name: 'Project Manager', unit: 'hr', rate: 140, cost: 90 },
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
      `INSERT INTO users (email, password_hash, name, is_admin)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [u.email, passwordHash, u.name, u.isAdmin]
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
  await seedRateCardExamples('equipment_rate_items', EQUIPMENT_RATE_EXAMPLES);
  await seedRateCardExamples('employee_role_rate_items', EMPLOYEE_ROLE_RATE_EXAMPLES);

  console.log('Seeded demo users:');
  DEMO_USERS.forEach((u) => console.log(`  ${u.email} / ${u.password}`));
  console.log('Seeded company info section placeholders.');
  console.log('Seeded structured rate card examples (if tables were empty).');
  console.log('Identity left blank -- populate with real CFE content via the Company Info page.');

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
