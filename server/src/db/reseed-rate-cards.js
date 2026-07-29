// One-off maintenance script: replaces Service Rates / Material Costs with
// structured example data, per docs/requirements/company-info.md. Destructive
// -- clears existing rows in service_rate_items/material_cost_items and the
// old freeform `content` on the two company_info_sections rows, then inserts
// fresh example rows. Safe to re-run (fully replaces each time).
//
// Usage: node src/db/reseed-rate-cards.js
import 'dotenv/config';
import { pool } from './pool.js';

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

async function replaceTable(table, rows) {
  await pool.query(`DELETE FROM ${table}`);
  for (const r of rows) {
    await pool.query(
      `INSERT INTO ${table} (name, unit, rate, cost) VALUES ($1, $2, $3, $4)`,
      [r.name, r.unit, r.rate, r.cost]
    );
  }
}

async function run() {
  await replaceTable('service_rate_items', SERVICE_RATE_EXAMPLES);
  await replaceTable('material_cost_items', MATERIAL_COST_EXAMPLES);

  await pool.query(
    `UPDATE company_info_sections SET content = '', updated_at = now()
     WHERE section_key IN ('service_rates', 'material_costs')`
  );

  console.log(`Reseeded service_rate_items (${SERVICE_RATE_EXAMPLES.length} rows).`);
  console.log(`Reseeded material_cost_items (${MATERIAL_COST_EXAMPLES.length} rows).`);
  console.log('Cleared old freeform content on service_rates / material_costs sections.');

  await pool.end();
}

run().catch((err) => {
  console.error('Reseed failed:', err);
  process.exit(1);
});
