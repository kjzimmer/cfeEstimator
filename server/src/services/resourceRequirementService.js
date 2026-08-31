import { pool } from '../db/pool.js';
import * as rateCardService from './rateCardService.js';
import * as memoryService from './memoryService.js';

// Task resource requirements (docs/incoming/task-resource-pipeline.md §4,
// refined per Karl -- see docs/feedback/). Manual (human_added) CRUD plus the
// Resource Agent's generated path (created_via: resource_estimation), same
// relationship the manual task CRUD had to the Task/Dependency Agent loop.

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

// Agent-facing creation path -- createRequirement() above always hardcodes
// 'human_added' for the manual UI; the Resource Agent needs
// 'resource_estimation' plus the confidence/basis/citation fields it reasons
// through per docs/feedback/.
export async function createGeneratedRequirement(
  taskId,
  {
    resourceType,
    description,
    qty = 0,
    unit = '',
    rationale = '',
    confident = true,
    uncertaintyNote = '',
    basisQuantity = null,
    basisQuantityUnit = null,
    basisRate = null,
    basisRateUnit = null,
    sourceRefs = [],
  }
) {
  const { rows } = await pool.query(
    `INSERT INTO task_resource_requirements
       (task_id, resource_type, description, qty, unit, rationale, created_via,
        confident, uncertainty_note, basis_quantity, basis_quantity_unit, basis_rate, basis_rate_unit, source_refs)
     VALUES ($1, $2, $3, $4, $5, $6, 'resource_estimation', $7, $8, $9, $10, $11, $12, $13::jsonb)
     RETURNING *`,
    [
      taskId,
      resourceType,
      description,
      qty,
      unit,
      rationale,
      confident,
      uncertaintyNote,
      basisQuantity,
      basisQuantityUnit,
      basisRate,
      basisRateUnit,
      JSON.stringify(sourceRefs),
    ]
  );
  return rows[0];
}

export async function findRequirementByDescription(taskId, description) {
  const { rows } = await pool.query(
    'SELECT * FROM task_resource_requirements WHERE task_id = $1 AND lower(description) = lower($2) LIMIT 1',
    [taskId, description]
  );
  return rows[0] || null;
}

// The "teach the agent" hook lives here, not in the route -- editing a
// requirement always goes through this function, so a correction to an
// AI-generated estimate gets captured as memory evidence no matter which
// caller (UI edit today, anything else later) makes the change. See
// memoryService.recordResourceCorrection for what happens with it.
export async function updateRequirement(
  requirementId,
  { resourceType, description, qty, unit, rationale, confident, uncertaintyNote, basisQuantity, basisRate, basisQuantityUnit, basisRateUnit }
) {
  const { rows: beforeRows } = await pool.query('SELECT * FROM task_resource_requirements WHERE id = $1', [requirementId]);
  const before = beforeRows[0];
  if (!before) return null;

  const { rows } = await pool.query(
    `UPDATE task_resource_requirements
     SET resource_type = $2, description = $3, qty = $4, unit = $5, rationale = $6,
         confident = $7, uncertainty_note = $8,
         basis_quantity = $9, basis_quantity_unit = $10, basis_rate = $11, basis_rate_unit = $12,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      requirementId,
      resourceType,
      description,
      qty || 0,
      unit || '',
      rationale || '',
      confident ?? true,
      uncertaintyNote || '',
      basisQuantity ?? null,
      basisQuantityUnit || null,
      basisRate ?? null,
      basisRateUnit || null,
    ]
  );
  const updated = rows[0];
  if (!updated) return null;

  await memoryService.recordResourceCorrection({
    requirement: before,
    corrected: {
      description,
      qty: qty || 0,
      unit: unit || '',
      basisQuantity: basisQuantity ?? null,
      basisRate: basisRate ?? null,
      rationale: rationale || '',
    },
  });

  return updated;
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
