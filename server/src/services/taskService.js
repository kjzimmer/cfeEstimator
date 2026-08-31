import { pool } from '../db/pool.js';

// Tasks + dependencies (docs/incoming/task-resource-pipeline.md). This phase
// only supports manual (human_added) tasks/dependencies -- the AI
// generation loop (Task Agent + Dependency Agent) is a later increment on
// top of this same data model and API.

export async function listTasks(workOrderId) {
  const [{ rows: tasks }, { rows: deps }] = await Promise.all([
    pool.query('SELECT * FROM tasks WHERE work_order_id = $1 ORDER BY sort_order, id', [workOrderId]),
    pool.query(
      `SELECT d.* FROM task_dependencies d
       JOIN tasks t ON t.id = d.task_id
       WHERE t.work_order_id = $1`,
      [workOrderId]
    ),
  ]);
  return tasks.map((task) => ({
    ...task,
    dependencies: deps.filter((d) => d.task_id === task.id),
  }));
}

export async function createTask(workOrderId, { name, description = '', responsibleParty = 'CFE', rationale = '' }) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (work_order_id, name, description, created_via, responsible_party, rationale)
     VALUES ($1, $2, $3, 'human_added', $4, $5)
     RETURNING *`,
    [workOrderId, name, description, responsibleParty, rationale]
  );
  return { ...rows[0], dependencies: [] };
}

// Agent-facing creation path -- createTask() above always hardcodes
// 'human_added' for the manual UI; the Task Agent needs 'sow_extraction' or
// 'dependency_gap_fill' and a rationale, per docs/incoming/task-resource-pipeline.md.
export async function createGeneratedTask(
  workOrderId,
  { name, description = '', createdVia, responsibleParty = 'CFE', rationale = '', sourceRefs = [] }
) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (work_order_id, name, description, created_via, responsible_party, rationale, source_refs)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING *`,
    [workOrderId, name, description, createdVia, responsibleParty, rationale, JSON.stringify(sourceRefs)]
  );
  return { ...rows[0], dependencies: [] };
}

export async function findTaskByName(workOrderId, name) {
  const { rows } = await pool.query(
    'SELECT * FROM tasks WHERE work_order_id = $1 AND lower(name) = lower($2) LIMIT 1',
    [workOrderId, name]
  );
  return rows[0] || null;
}

export async function updateTask(taskId, { name, description, responsibleParty, rationale }) {
  const { rows } = await pool.query(
    `UPDATE tasks
     SET name = $2, description = $3, responsible_party = $4, rationale = $5, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [taskId, name, description || '', responsibleParty || 'CFE', rationale || '']
  );
  return rows[0] || null;
}

export async function deleteTask(taskId) {
  const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [taskId]);
  return rowCount > 0;
}

// Cheap DFS cycle guard -- this phase is manual entry only (small graphs),
// so a full graph load per check is fine; revisit if the AI generation loop
// needs something more efficient for larger task sets.
async function wouldCreateCycle(taskId, dependsOnTaskId) {
  if (taskId === dependsOnTaskId) return true;
  const { rows } = await pool.query(
    `SELECT d.task_id, d.depends_on_task_id FROM task_dependencies d
     JOIN tasks t ON t.id = d.task_id
     WHERE t.work_order_id = (SELECT work_order_id FROM tasks WHERE id = $1)`,
    [taskId]
  );
  // The new edge means dependsOnTaskId must happen before taskId. That's a
  // cycle only if taskId can already (transitively) reach dependsOnTaskId
  // via existing edges -- i.e. taskId is already required to happen before
  // dependsOnTaskId, so requiring the reverse too would close a loop. Walk
  // forward from taskId along existing predecessor->successor edges and
  // check whether dependsOnTaskId is reachable.
  const bySuccessor = new Map();
  for (const d of rows) {
    if (!bySuccessor.has(d.depends_on_task_id)) bySuccessor.set(d.depends_on_task_id, []);
    bySuccessor.get(d.depends_on_task_id).push(d.task_id);
  }
  const stack = [taskId];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (current === dependsOnTaskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of bySuccessor.get(current) || []) stack.push(next);
  }
  return false;
}

export async function addDependency(taskId, dependsOnTaskId, { basis = 'human_added', confident = true, uncertaintyNote = '' } = {}) {
  // Idempotent rather than erroring or duplicating -- a reconciliation pass
  // (the Task Agent rechecking dependencies against current state) will
  // legitimately re-propose an edge that's already there; that should be a
  // silent no-op, not a second identical row.
  const { rows: existingRows } = await pool.query(
    'SELECT * FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2',
    [taskId, dependsOnTaskId]
  );
  if (existingRows[0]) return existingRows[0];

  if (await wouldCreateCycle(taskId, dependsOnTaskId)) {
    throw new Error('That would create a circular dependency');
  }
  const { rows } = await pool.query(
    `INSERT INTO task_dependencies (task_id, depends_on_task_id, basis, confident, uncertainty_note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [taskId, dependsOnTaskId, basis, confident, uncertaintyNote]
  );
  return rows[0];
}

export async function deleteDependency(dependencyId) {
  const { rowCount } = await pool.query('DELETE FROM task_dependencies WHERE id = $1', [dependencyId]);
  return rowCount > 0;
}

// §5.3's approval gate: a simple bulk draft -> approved transition across
// every task on the work order, rather than a separate boolean column.
export async function approveTaskList(workOrderId) {
  const { rows } = await pool.query(
    `UPDATE tasks SET status = 'approved', updated_at = now()
     WHERE work_order_id = $1 AND status = 'draft'
     RETURNING id`,
    [workOrderId]
  );
  return rows.length;
}
