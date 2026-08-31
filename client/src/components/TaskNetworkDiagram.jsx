import { useMemo } from 'react';
import { computeColumns } from '../lib/taskGraph.js';

// Read-only network diagram, computed entirely client-side from data the
// Tasks tab already has loaded -- no new endpoint, no new dependency.
// Left-to-right layering (predecessors before successors), matching
// conventional CPM/PERT network diagram orientation, not a top-to-bottom
// flowchart -- deliberate, since the point of this view is to read as a
// real project-management artifact, not a generic diagram.
const NODE_WIDTH = 220;
const NODE_HEIGHT = 76;
const COL_GAP = 90;
const ROW_GAP = 24;
const MARGIN = 30;

const RESPONSIBLE_LABELS = { owner: 'Owner', third_party: 'Third party' };

function isIsolated(task, tasks) {
  const hasIncoming = tasks.some((t) => t.dependencies.some((d) => d.depends_on_task_id === task.id));
  return task.dependencies.length === 0 && !hasIncoming;
}

export default function TaskNetworkDiagram({ tasks }) {
  const layout = useMemo(() => {
    const columnOf = computeColumns(tasks);
    const byColumn = new Map();
    tasks.forEach((t) => {
      const col = columnOf.get(t.id) ?? 0;
      if (!byColumn.has(col)) byColumn.set(col, []);
      byColumn.get(col).push(t);
    });

    const positions = new Map();
    let maxRows = 0;
    for (const [col, colTasks] of byColumn.entries()) {
      maxRows = Math.max(maxRows, colTasks.length);
      colTasks.forEach((t, row) => {
        positions.set(t.id, {
          x: MARGIN + col * (NODE_WIDTH + COL_GAP),
          y: MARGIN + row * (NODE_HEIGHT + ROW_GAP),
        });
      });
    }

    const numCols = byColumn.size;
    const width = MARGIN * 2 + numCols * NODE_WIDTH + Math.max(0, numCols - 1) * COL_GAP;
    const height = MARGIN * 2 + maxRows * NODE_HEIGHT + Math.max(0, maxRows - 1) * ROW_GAP;

    const edges = [];
    tasks.forEach((t) => {
      const to = positions.get(t.id);
      t.dependencies.forEach((d) => {
        const from = positions.get(d.depends_on_task_id);
        if (from && to) edges.push({ id: d.id, from, to, confident: d.confident });
      });
    });

    return { positions, width: Math.max(width, 400), height: Math.max(height, 200), edges };
  }, [tasks]);

  if (tasks.length === 0) return null;

  return (
    <div className="shrink-0 overflow-auto border border-border rounded-lg bg-bg">
      <svg width={layout.width} height={layout.height}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-current text-text-secondary" />
          </marker>
        </defs>

        {layout.edges.map((e) => {
          const x1 = e.from.x + NODE_WIDTH;
          const y1 = e.from.y + NODE_HEIGHT / 2;
          const x2 = e.to.x;
          const y2 = e.to.y + NODE_HEIGHT / 2;
          const midX = (x1 + x2) / 2;
          return (
            <path
              key={e.id}
              d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
              fill="none"
              className={e.confident ? 'stroke-current text-border' : 'stroke-current text-amber-400'}
              strokeWidth={e.confident ? 1.5 : 2}
              strokeDasharray={e.confident ? undefined : '4 3'}
              markerEnd="url(#arrow)"
            />
          );
        })}

        {tasks.map((t) => {
          const pos = layout.positions.get(t.id);
          if (!pos) return null;
          const flagged = t.responsible_party !== 'CFE';
          const orphan = isIsolated(t, tasks);
          return (
            <foreignObject key={t.id} x={pos.x} y={pos.y} width={NODE_WIDTH} height={NODE_HEIGHT}>
              <div
                className={[
                  'w-full h-full rounded-md border px-2.5 py-2 flex flex-col justify-center overflow-hidden',
                  orphan
                    ? 'border-red-400 border-dashed bg-red-50'
                    : flagged
                    ? 'border-accent/30 bg-accent/10'
                    : 'border-border bg-surface',
                ].join(' ')}
              >
                {flagged && (
                  <span className="text-[10px] font-medium text-accent uppercase tracking-wide mb-0.5">
                    {RESPONSIBLE_LABELS[t.responsible_party]}
                  </span>
                )}
                <span className="text-xs text-text leading-snug line-clamp-3">{t.name}</span>
                {orphan && <span className="text-[10px] font-medium text-red-600 mt-0.5">unconnected</span>}
              </div>
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
}
