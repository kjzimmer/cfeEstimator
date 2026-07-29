import { pool } from '../db/pool.js';

// Two structured rate-card tables share this identical shape -- see
// docs/requirements/company-info.md. cardKey is always one of the fixed
// internal keys below, never user input, so interpolating the table name is safe.
const TABLES = {
  service_rates: 'service_rate_items',
  material_costs: 'material_cost_items',
};

function tableFor(cardKey) {
  const table = TABLES[cardKey];
  if (!table) throw new Error(`Unknown rate card: ${cardKey}`);
  return table;
}

export function isRateCardKey(cardKey) {
  return Object.prototype.hasOwnProperty.call(TABLES, cardKey);
}

export async function listItems(cardKey) {
  const { rows } = await pool.query(`SELECT * FROM ${tableFor(cardKey)} ORDER BY name`);
  return rows;
}

export async function createItem(cardKey, { name, unit = '', rate = 0, cost = 0 }) {
  const { rows } = await pool.query(
    `INSERT INTO ${tableFor(cardKey)} (name, unit, rate, cost) VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, unit, rate, cost]
  );
  return rows[0];
}

export async function updateItem(cardKey, itemId, { name, unit = '', rate = 0, cost = 0 }) {
  const { rows } = await pool.query(
    `UPDATE ${tableFor(cardKey)}
     SET name = $2, unit = $3, rate = $4, cost = $5, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [itemId, name, unit, rate, cost]
  );
  return rows[0] || null;
}

export async function deleteItem(cardKey, itemId) {
  const { rowCount } = await pool.query(`DELETE FROM ${tableFor(cardKey)} WHERE id = $1`, [itemId]);
  return rowCount > 0;
}
