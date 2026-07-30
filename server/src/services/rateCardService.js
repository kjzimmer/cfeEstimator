import { pool } from '../db/pool.js';

// Two structured rate-card tables share this identical shape -- see
// docs/requirements/company-info.md. cardKey is always one of the fixed
// internal keys below, never user input, so interpolating the table name is safe.
const TABLES = {
  service_rates: 'service_rate_items',
  material_costs: 'material_cost_items',
  equipment_rates: 'equipment_rate_items',
  employee_role_rates: 'employee_role_rate_items',
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

// Used server-side to resolve a work order line item's rate/cost from its
// source rate card at add-time -- never trust a client-supplied rate/cost
// for a rate-card-backed line. See docs/requirements/work-orders.md.
export async function getItem(cardKey, itemId) {
  const { rows } = await pool.query(`SELECT * FROM ${tableFor(cardKey)} WHERE id = $1`, [itemId]);
  return rows[0] || null;
}

// Name-based lookup for the agent, which works from conversation text, not
// internal ids. Case-insensitive exact match.
export async function findItemByName(cardKey, name) {
  const { rows } = await pool.query(
    `SELECT * FROM ${tableFor(cardKey)} WHERE lower(name) = lower($1) LIMIT 1`,
    [name]
  );
  return rows[0] || null;
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
