// Shared by TaskNetworkDiagram.jsx (visual layering) and TasksPanel.jsx
// (dependency-order list sort) -- one topological computation, not two
// copies that could drift.

// Longest-path-from-root layering: a task's column is one more than the
// deepest of its dependencies' columns, so every edge always points from a
// strictly earlier column to a strictly later one -- no back-edges to route
// around. Memoized recursion; the write-side cycle guard (taskService.js)
// means this graph should always be a DAG, but a `visiting` guard keeps a
// stray cycle from infinite-looping the computation instead of just looking odd.
export function computeColumns(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const column = new Map();
  const visiting = new Set();

  function columnOf(taskId) {
    if (column.has(taskId)) return column.get(taskId);
    if (visiting.has(taskId)) return 0;
    visiting.add(taskId);
    const task = byId.get(taskId);
    const deps = task?.dependencies || [];
    const depCols = deps.map((d) => columnOf(d.depends_on_task_id));
    const result = depCols.length ? Math.max(...depCols) + 1 : 0;
    column.set(taskId, result);
    visiting.delete(taskId);
    return result;
  }

  tasks.forEach((t) => columnOf(t.id));
  return column;
}

// A valid topological order (predecessors before successors), for list
// display -- not the only valid order (siblings at the same depth have no
// defined order relative to each other), but always dependency-consistent.
// Ties broken by id so the order is stable across re-renders.
export function sortByDependencyOrder(tasks) {
  const columnOf = computeColumns(tasks);
  return [...tasks].sort((a, b) => (columnOf.get(a.id) ?? 0) - (columnOf.get(b.id) ?? 0) || a.id - b.id);
}
