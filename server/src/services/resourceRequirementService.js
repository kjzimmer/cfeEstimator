import { pool } from '../db/pool.js';
import * as rateCardService from './rateCardService.js';

// Task resource requirements (docs/incoming/task-resource-pipeline.md §4,
// refined per Karl -- see docs/feedback/). This phase only supports manual
// (human_added) requirements -- the Resource Agent's estimation loop is a
// later increment on top of this same data model and API, same pattern as
// tasks/task_dependencies before the Task/Dependency Agent loop landed.

export async function listRequirements(workOrderId) {
  const { rows } = await pool.query(
    `SELECT r.* FROM task_resource_requirements r
     JOIN tasks t ON t.id = r.task_id
     WHERE t.work_order_id = $1
     ORDER BY r.task_id, r.id`,
    [workOrderId]
  );
  return rows;
}

export async function createRequirement(
  taskId,
  { resourceType, description, qty = 0, unit = '', rationale = '' }
) {
  const { rows } = await pool.query(
    `INSERT INTO task_resource_requirements (task_id, resource_type, description, qty, unit, rationale, created_via)
     VALUES ($1, $2, $3, $4, $5, $6, 'human_added')
     RETURNING *`,
    [taskId, resourceType, description, qty, unit, rationale]
  );
  return rows[0];
}

export async function updateRequirement(requirementId, { resourceType, description, qty, unit, rationale }) {
  const { rows } = await pool.query(
    `UPDATE task_resource_requirements
     SET resource_type = $2, description = $3, qty = $4, unit = $5, rationale = $6, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [requirementId, resourceType, description, qty || 0, unit || '', rationale || '']
  );
  return rows[0] || null;
}

export async function deleteRequirement(requirementId) {
  const { rowCount } = await pool.query('DELETE FROM task_resource_requirements WHERE id = $1', [requirementId]);
  return rowCount > 0;
}

// resource_type -> which rate card a requirement's description gets matched
// against. 'other' maps to the Service Rate Card as the closest fit for a
// resource that isn't labor/material/equipment -- see company-info.md's
// four-card split.
const RATE_CARD_BY_RESOURCE_TYPE = {
  labor: 'employee_role_rates',
  material: 'material_costs',
  equipment: 'equipment_rates',
  other: 'service_rates',
};

// The mechanical, algorithmic last step: group requirements across tasks
// that describe the same resource (exact match on resource_type +
// case-insensitive description + unit -- the estimation step, human or
// agent, is responsible for using a consistent description when two tasks
// really do share one resource; this step does no fuzzy matching), sum
// quantities, and resolve each group against the matching rate card by name
// -- same rate-authority rule every other line item follows (no freehand
// rates), unresolved (rate/cost null) if no match. Rate lookup + all writes
// share one client/transaction (rather than reusing workOrderService's
// pool-based addLineItem) so a failure partway through can't leave some
// groups' line items committed and others rolled back.
// Replaces (not appends to) any previously generated line items so re-running
// after editing requirements doesn't duplicate -- manually-added line items
// (no linked tasks) are left untouched.
export async function generateLineItems(workOrderId) {
  const requirements = await listRequirements(workOrderId);

  const groups = new Map();
  for (const r of requirements) {
    const key = `${r.resource_type}::${r.description.trim().toLowerCase()}::${r.unit.trim().toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, { resourceType: r.resource_type, description: r.description, unit: r.unit, qty: 0, taskIds: [] });
    }
    const g = groups.get(key);
    g.qty += Number(r.qty);
    g.taskIds.push(r.task_id);
  }

  const client = await pool.connect();
  try {
    const { rows: woRows } = await client.query('SELECT status FROM work_orders WHERE id = $1', [workOrderId]);
    if (!woRows[0]) throw new Error('Work order not found');
    if (woRows[0].status !== 'draft') throw new Error('Work order is not in draft state');

    await client.query('BEGIN');

    // Clear only line items this pass previously generated (ones with at
    // least one linked task) -- manual, un-linked line items are untouched.
    await client.query(
      `DELETE FROM work_order_line_items
       WHERE work_order_id = $1
         AND id IN (SELECT line_item_id FROM work_order_line_item_tasks)`,
      [workOrderId]
    );

    let sortOrder = 0;
    for (const g of groups.values()) {
      const cardType = RATE_CARD_BY_RESOURCE_TYPE[g.resourceType];
      const match = await rateCardService.findItemByName(cardType, g.description);
      const rateCardType = match ? cardType : null;
      const name = match ? match.name : g.description;
      const unit = match ? match.unit : g.unit;
      const rate = match ? match.rate : null;
      const cost = match ? match.cost : null;

      const { rows } = await client.query(
        `INSERT INTO work_order_line_items (work_order_id, rate_card_type, name, unit, qty, rate, cost, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [workOrderId, rateCardType, name, unit, g.qty, rate, cost, sortOrder]
      );
      sortOrder += 1;
      for (const taskId of g.taskIds) {
        await client.query(
          `INSERT INTO work_order_line_item_tasks (line_item_id, task_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [rows[0].id, taskId]
        );
      }
    }

    await client.query('COMMIT');
    return { lineItemCount: groups.size };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
