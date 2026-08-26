import { pool } from '../db/pool.js';
import * as rateCardService from './rateCardService.js';

const DRAFT_ONLY_ERROR = 'Work order is not in draft state';

async function assertDraft(workOrderId) {
  const { rows } = await pool.query('SELECT status FROM work_orders WHERE id = $1', [workOrderId]);
  if (!rows[0]) return null;
  if (rows[0].status !== 'draft') throw new Error(DRAFT_ONLY_ERROR);
  return rows[0];
}

// amount/subtotal/contingencyAmount/total are always derived, never stored
// -- avoids them ever going stale relative to the line items they summarize.
export function withTotals(workOrder, lineItems) {
  const items = lineItems.map((li) => ({ ...li, amount: Number(li.qty) * Number(li.rate) }));
  const subtotal = items.reduce((sum, li) => sum + li.amount, 0);
  const contingencyAmount = subtotal * (Number(workOrder.contingency_percent) / 100);
  return {
    ...workOrder,
    lineItems: items,
    subtotal,
    contingencyAmount,
    total: subtotal + contingencyAmount,
  };
}

// Summary list for revision history -- includes subtotal/total but not full
// line items, so a past version's approximate value is visible without a
// second round trip per row.
export async function listWorkOrders(projectId) {
  const { rows } = await pool.query(
    `SELECT wo.*, COALESCE(li.subtotal, 0) AS subtotal
     FROM work_orders wo
     LEFT JOIN (
       SELECT work_order_id, SUM(qty * rate) AS subtotal
       FROM work_order_line_items GROUP BY work_order_id
     ) li ON li.work_order_id = wo.id
     WHERE wo.project_id = $1
     ORDER BY wo.revision DESC`,
    [projectId]
  );
  return rows.map((wo) => {
    const subtotal = Number(wo.subtotal);
    const contingencyAmount = subtotal * (Number(wo.contingency_percent) / 100);
    return { ...wo, subtotal, contingencyAmount, total: subtotal + contingencyAmount };
  });
}

async function getLineItems(workOrderId) {
  const { rows } = await pool.query(
    'SELECT * FROM work_order_line_items WHERE work_order_id = $1 ORDER BY sort_order, id',
    [workOrderId]
  );
  return rows;
}

// cost included -- internal use only (profit summary, revision copy). Never
// pass this to the PDF path; use getLineItemsForPdf instead.
export async function getWorkOrder(id) {
  const { rows } = await pool.query('SELECT * FROM work_orders WHERE id = $1', [id]);
  if (!rows[0]) return null;
  const lineItems = await getLineItems(id);
  return withTotals(rows[0], lineItems);
}

export async function getCurrentDraft(projectId) {
  const { rows } = await pool.query(
    "SELECT * FROM work_orders WHERE project_id = $1 AND status = 'draft'",
    [projectId]
  );
  if (!rows[0]) return null;
  return getWorkOrder(rows[0].id);
}

export async function ensureDraft(projectId, userId) {
  const existing = await getCurrentDraft(projectId);
  if (existing) return existing;

  const { rows: revRows } = await pool.query(
    'SELECT COALESCE(MAX(revision), 0) + 1 AS next FROM work_orders WHERE project_id = $1',
    [projectId]
  );
  const { rows } = await pool.query(
    `INSERT INTO work_orders (project_id, revision, created_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [projectId, revRows[0].next, userId]
  );
  return withTotals(rows[0], []);
}

export async function updateDraftFields(
  workOrderId,
  { scopeText, siteLocation, requestedStart, contingencyPercent, terms }
) {
  await assertDraft(workOrderId);
  const { rows } = await pool.query(
    `UPDATE work_orders
     SET scope_text = $2, site_location = $3, requested_start = $4, contingency_percent = $5, terms = $6, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [workOrderId, scopeText, siteLocation, requestedStart, contingencyPercent, terms]
  );
  const lineItems = await getLineItems(workOrderId);
  return withTotals(rows[0], lineItems);
}

// Resolves rate/cost server-side from the live rate card when rateCardType +
// rateCardItemId/rateCardItemName are given -- never trusts a client-supplied
// rate/cost for a rate-card-backed line. Name lookup exists for the agent,
// which works from conversation text, not internal ids; the UI form uses id
// (it has the dropdown's list).
//
// A line with no rateCardType is unresolved: rate/cost are always null,
// regardless of what a caller passes -- there is no freehand rate entry
// path anywhere, by anyone, admin or not, agent or human. See
// docs/feedback/2026-08-13-rate-card-authority-gap.md. Scoping without a
// resolved rate is expected and fine; only finalize enforces resolution.
async function resolveLine({ rateCardType, rateCardItemId, rateCardItemName, name, unit, qty }) {
  if (rateCardType && (rateCardItemId || rateCardItemName)) {
    const item = rateCardItemId
      ? await rateCardService.getItem(rateCardType, rateCardItemId)
      : await rateCardService.findItemByName(rateCardType, rateCardItemName);
    if (!item) throw new Error('Rate card item not found');
    return {
      rateCardType,
      name: item.name,
      unit: item.unit,
      rate: item.rate,
      cost: item.cost,
      qty: qty ?? 1,
    };
  }
  return { rateCardType: null, name, unit: unit || '', rate: null, cost: null, qty: qty ?? 1 };
}

export async function addLineItem(workOrderId, payload) {
  await assertDraft(workOrderId);
  const line = await resolveLine(payload);
  const { rows } = await pool.query(
    `INSERT INTO work_order_line_items (work_order_id, rate_card_type, name, unit, qty, rate, cost)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [workOrderId, line.rateCardType, line.name, line.unit, line.qty, line.rate, line.cost]
  );
  return rows[0];
}

// Shares resolveLine() with addLineItem so editing a line goes through the
// exact same rate-authority resolution -- re-passing a resolved line's own
// rateCardType/name re-resolves against the live rate card (picking up any
// rate change since it was added) rather than freezing the rate at add-time.
export async function updateLineItem(workOrderId, itemId, payload) {
  await assertDraft(workOrderId);
  const line = await resolveLine(payload);
  const { rows } = await pool.query(
    `UPDATE work_order_line_items
     SET rate_card_type = $3, name = $4, unit = $5, qty = $6, rate = $7, cost = $8, updated_at = now()
     WHERE id = $1 AND work_order_id = $2
     RETURNING *`,
    [itemId, workOrderId, line.rateCardType, line.name, line.unit, line.qty, line.rate, line.cost]
  );
  return rows[0] || null;
}

export async function deleteLineItem(workOrderId, itemId) {
  await assertDraft(workOrderId);
  const { rowCount } = await pool.query(
    'DELETE FROM work_order_line_items WHERE id = $1 AND work_order_id = $2',
    [itemId, workOrderId]
  );
  return rowCount > 0;
}

// Wholesale replace -- same idiom as update_project_component (agent sends
// the full current list, not a delta). Used by the agent's drafting tool.
export async function replaceLineItems(workOrderId, items) {
  await assertDraft(workOrderId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM work_order_line_items WHERE work_order_id = $1', [workOrderId]);
    let sortOrder = 0;
    for (const item of items) {
      const line = await resolveLine(item);
      await client.query(
        `INSERT INTO work_order_line_items (work_order_id, rate_card_type, name, unit, qty, rate, cost, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [workOrderId, line.rateCardType, line.name, line.unit, line.qty, line.rate, line.cost, sortOrder]
      );
      sortOrder += 1;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return getWorkOrder(workOrderId);
}

// The structural cost firewall: this is the only query the PDF path is
// allowed to call. It does not select `cost` -- not "selects it but the
// template ignores it." See docs/requirements/work-orders.md.
export async function getLineItemsForPdf(workOrderId) {
  const { rows } = await pool.query(
    `SELECT id, name, unit, qty, rate FROM work_order_line_items
     WHERE work_order_id = $1 ORDER BY sort_order, id`,
    [workOrderId]
  );
  return rows.map((li) => ({ ...li, amount: Number(li.qty) * Number(li.rate) }));
}

export async function finalize(workOrderId, userId, fileId) {
  await assertDraft(workOrderId);
  const { rows } = await pool.query(
    `UPDATE work_orders
     SET status = 'finalized', finalized_by = $2, finalized_at = now(), file_id = $3, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [workOrderId, userId, fileId]
  );
  const lineItems = await getLineItems(workOrderId);
  return withTotals(rows[0], lineItems);
}

export async function createRevision(fromWorkOrderId, userId) {
  const source = await pool.query('SELECT * FROM work_orders WHERE id = $1', [fromWorkOrderId]);
  if (!source.rows[0]) throw new Error('Work order not found');
  if (source.rows[0].status !== 'finalized') {
    throw new Error('Can only create a revision from a finalized work order');
  }
  const existingDraft = await getCurrentDraft(source.rows[0].project_id);
  if (existingDraft) throw new Error('A draft already exists for this project');

  const src = source.rows[0];
  const { rows: revRows } = await pool.query(
    'SELECT COALESCE(MAX(revision), 0) + 1 AS next FROM work_orders WHERE project_id = $1',
    [src.project_id]
  );
  const { rows } = await pool.query(
    `INSERT INTO work_orders (project_id, revision, scope_text, site_location, requested_start, contingency_percent, terms, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      src.project_id,
      revRows[0].next,
      src.scope_text,
      src.site_location,
      src.requested_start,
      src.contingency_percent,
      src.terms,
      userId,
    ]
  );
  const newWorkOrder = rows[0];

  const sourceLineItems = await getLineItems(fromWorkOrderId);
  let sortOrder = 0;
  for (const li of sourceLineItems) {
    await pool.query(
      `INSERT INTO work_order_line_items (work_order_id, rate_card_type, name, unit, qty, rate, cost, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newWorkOrder.id, li.rate_card_type, li.name, li.unit, li.qty, li.rate, li.cost, sortOrder]
    );
    sortOrder += 1;
  }

  return getWorkOrder(newWorkOrder.id);
}

// Admin-only view (route-gated) -- the only place cost/margin figures are
// computed and shown. Never feeds the PDF.
export async function getProfitSummary(workOrderId) {
  const lineItems = await getLineItems(workOrderId);
  const lines = lineItems.map((li) => {
    const qty = Number(li.qty);
    const rate = Number(li.rate);
    const cost = li.cost === null ? null : Number(li.cost);
    return {
      id: li.id,
      name: li.name,
      qty,
      rate,
      cost,
      amount: qty * rate,
      profit: cost === null ? null : (rate - cost) * qty,
    };
  });
  const knownProfitLines = lines.filter((l) => l.profit !== null);
  return {
    lines,
    totalProfit: knownProfitLines.reduce((sum, l) => sum + l.profit, 0),
    unknownCostLineCount: lines.length - knownProfitLines.length,
  };
}
