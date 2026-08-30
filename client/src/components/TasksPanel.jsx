import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import TaskNetworkDiagram from './TaskNetworkDiagram.jsx';

const RESPONSIBLE_LABELS = { CFE: 'CFE', owner: 'Owner', third_party: 'Third party' };
const RESPONSIBLE_OPTIONS = Object.keys(RESPONSIBLE_LABELS);

const RESOURCE_TYPE_LABELS = { labor: 'Labor', material: 'Material', equipment: 'Equipment', other: 'Other' };
const RESOURCE_TYPE_OPTIONS = Object.keys(RESOURCE_TYPE_LABELS);

function AddTaskForm({ projectId, workOrderId, onAdded }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [responsibleParty, setResponsibleParty] = useState('CFE');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const task = await api.createTask(projectId, workOrderId, { name, description, responsibleParty });
      setName('');
      setDescription('');
      setResponsibleParty('CFE');
      setOpen(false);
      onAdded(task);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white transition-colors w-fit"
      >
        Add task
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 bg-bg border border-border rounded-md p-3">
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Task name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text w-56"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text w-64"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Responsible</label>
        <select
          value={responsibleParty}
          onChange={(e) => setResponsibleParty(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text"
        >
          {RESPONSIBLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {RESPONSIBLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-60 text-white transition-colors"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-sm font-medium px-3 py-1.5 rounded-md text-text-secondary hover:text-text hover:bg-black/[0.03] transition-colors"
      >
        Cancel
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}

function DependencyPicker({ task, otherTasks, projectId, workOrderId, onAdded }) {
  const choices = otherTasks.filter(
    (t) => t.id !== task.id && !task.dependencies.some((d) => d.depends_on_task_id === t.id)
  );
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');

  if (choices.length === 0) return null;

  async function handleAdd() {
    if (!selected) return;
    setError('');
    try {
      const dep = await api.addTaskDependency(projectId, workOrderId, task.id, Number(selected));
      setSelected('');
      onAdded(dep);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex items-center gap-1 mt-1">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="text-xs rounded-md border border-border bg-surface px-1.5 py-1 text-text"
      >
        <option value="">Depends on…</option>
        {choices.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button onClick={handleAdd} disabled={!selected} className="text-xs font-medium text-accent disabled:opacity-40">
        Add
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

// Add/remove only, no inline edit -- same lighter-weight pattern as
// DependencyPicker for a task's sub-items, not the full edit TaskRow gets.
function AddResourceRequirementForm({ task, projectId, workOrderId, onAdded }) {
  const [resourceType, setResourceType] = useState('labor');
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('');
  const [rationale, setRationale] = useState('');
  const [error, setError] = useState('');

  async function handleAdd(e) {
    e.preventDefault();
    if (!description.trim()) return;
    setError('');
    try {
      const req = await api.createResourceRequirement(projectId, workOrderId, task.id, {
        resourceType,
        description,
        qty: Number(qty) || 0,
        unit,
        rationale,
      });
      setDescription('');
      setQty('1');
      setUnit('');
      setRationale('');
      onAdded(req);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-1.5 mt-1">
      <select
        value={resourceType}
        onChange={(e) => setResourceType(e.target.value)}
        className="text-xs rounded-md border border-border bg-surface px-1.5 py-1 text-text"
      >
        {RESOURCE_TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {RESOURCE_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Resource description"
        className="text-xs rounded-md border border-border bg-surface px-1.5 py-1 text-text w-44"
      />
      <input
        type="number"
        step="0.01"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className="text-xs rounded-md border border-border bg-surface px-1.5 py-1 text-text w-16"
      />
      <input
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        placeholder="unit"
        className="text-xs rounded-md border border-border bg-surface px-1.5 py-1 text-text w-14"
      />
      <input
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        placeholder="Rationale (optional)"
        className="text-xs rounded-md border border-border bg-surface px-1.5 py-1 text-text w-40"
      />
      <button type="submit" disabled={!description.trim()} className="text-xs font-medium text-accent disabled:opacity-40">
        Add
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}

// Full inline edit, unlike the add/remove-only dependency picker -- these
// carry enough (basis, confidence, AI vs. human origin) that a human
// correcting an AI estimate needs to see and adjust all of it. Editing an
// AI-generated (resource_estimation) requirement is also how the "teach the
// agent" loop happens: the server captures the correction as memory evidence
// automatically on save, no separate step.
function RequirementRow({ requirement, projectId, workOrderId, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setDraft({
      resourceType: requirement.resource_type,
      description: requirement.description,
      qty: requirement.qty,
      unit: requirement.unit,
      rationale: requirement.rationale,
      confident: requirement.confident,
      uncertaintyNote: requirement.uncertainty_note,
      basisQuantity: requirement.basis_quantity ?? '',
      basisQuantityUnit: requirement.basis_quantity_unit ?? '',
      basisRate: requirement.basis_rate ?? '',
      basisRateUnit: requirement.basis_rate_unit ?? '',
    });
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    try {
      const updated = await api.updateResourceRequirement(projectId, workOrderId, requirement.id, {
        ...draft,
        qty: Number(draft.qty) || 0,
        basisQuantity: draft.basisQuantity === '' ? null : Number(draft.basisQuantity),
        basisRate: draft.basisRate === '' ? null : Number(draft.basisRate),
      });
      onUpdated(updated);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteResourceRequirement(projectId, workOrderId, requirement.id);
      onDeleted(requirement.id);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-1.5 p-2 rounded-md border border-border bg-surface flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          <select
            value={draft.resourceType}
            onChange={(e) => setDraft((d) => ({ ...d, resourceType: e.target.value }))}
            className="text-xs rounded-md border border-border bg-bg px-1.5 py-1 text-text"
          >
            {RESOURCE_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {RESOURCE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            className="text-xs rounded-md border border-border bg-bg px-1.5 py-1 text-text w-48"
          />
          <input
            type="number"
            step="0.01"
            value={draft.qty}
            onChange={(e) => setDraft((d) => ({ ...d, qty: e.target.value }))}
            className="text-xs rounded-md border border-border bg-bg px-1.5 py-1 text-text w-16"
          />
          <input
            value={draft.unit}
            onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
            placeholder="unit"
            className="text-xs rounded-md border border-border bg-bg px-1.5 py-1 text-text w-14"
          />
        </div>
        <input
          value={draft.rationale}
          onChange={(e) => setDraft((d) => ({ ...d, rationale: e.target.value }))}
          placeholder="Rationale"
          className="text-xs rounded-md border border-border bg-bg px-1.5 py-1 text-text"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-text-secondary">Basis:</span>
          <input
            type="number"
            step="0.01"
            value={draft.basisQuantity}
            onChange={(e) => setDraft((d) => ({ ...d, basisQuantity: e.target.value }))}
            placeholder="qty"
            className="text-xs rounded-md border border-border bg-bg px-1.5 py-1 text-text w-16"
          />
          <input
            value={draft.basisQuantityUnit}
            onChange={(e) => setDraft((d) => ({ ...d, basisQuantityUnit: e.target.value }))}
            placeholder="unit"
            className="text-xs rounded-md border border-border bg-bg px-1.5 py-1 text-text w-14"
          />
          <span className="text-xs text-text-secondary">÷</span>
          <input
            type="number"
            step="0.01"
            value={draft.basisRate}
            onChange={(e) => setDraft((d) => ({ ...d, basisRate: e.target.value }))}
            placeholder="rate"
            className="text-xs rounded-md border border-border bg-bg px-1.5 py-1 text-text w-16"
          />
          <input
            value={draft.basisRateUnit}
            onChange={(e) => setDraft((d) => ({ ...d, basisRateUnit: e.target.value }))}
            placeholder="unit"
            className="text-xs rounded-md border border-border bg-bg px-1.5 py-1 text-text w-20"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={!draft.confident}
            onChange={(e) => setDraft((d) => ({ ...d, confident: !e.target.checked }))}
          />
          Uncertain
        </label>
        {!draft.confident && (
          <input
            value={draft.uncertaintyNote}
            onChange={(e) => setDraft((d) => ({ ...d, uncertaintyNote: e.target.value }))}
            placeholder="What's uncertain"
            className="text-xs rounded-md border border-border bg-bg px-1.5 py-1 text-text"
          />
        )}
        <div>
          <button onClick={save} disabled={busy} className="text-xs font-medium text-accent mr-2">
            Save
          </button>
          <button onClick={() => setEditing(false)} className="text-xs font-medium text-text-secondary">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const hasBasis = requirement.basis_quantity != null && requirement.basis_rate != null;

  return (
    <div
      className={[
        'mt-1.5 p-2 rounded-md border flex items-start justify-between gap-2',
        requirement.confident === false ? 'border-amber-300 border-dashed bg-amber-50' : 'border-border bg-surface',
      ].join(' ')}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-black/[0.05] text-text-secondary">
            {RESOURCE_TYPE_LABELS[requirement.resource_type]}
          </span>
          <span className="text-xs text-text font-medium">{requirement.description}</span>
          <span className="text-xs text-text-secondary font-mono">
            {requirement.qty} {requirement.unit}
          </span>
          {requirement.created_via === 'resource_estimation' && (
            <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-accent/10 text-accent">AI estimate</span>
          )}
          {requirement.confident === false && (
            <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-800">uncertain</span>
          )}
        </div>
        {hasBasis && (
          <p className="text-xs text-text-secondary mt-0.5 font-mono">
            basis: {requirement.basis_quantity} {requirement.basis_quantity_unit} ÷ {requirement.basis_rate} {requirement.basis_rate_unit}
          </p>
        )}
        {requirement.rationale && <p className="text-xs text-text-secondary mt-0.5 italic">{requirement.rationale}</p>}
        {requirement.confident === false && requirement.uncertainty_note && (
          <p className="text-xs text-amber-800 mt-0.5">{requirement.uncertainty_note}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={startEdit} className="text-xs font-medium text-text-secondary hover:text-text">
          Edit
        </button>
        <button onClick={remove} disabled={busy} className="text-xs font-medium text-red-600">
          Delete
        </button>
      </div>
    </div>
  );
}

function TaskRow({ task, allTasks, requirements, projectId, workOrderId, onUpdated, onDeleted, onDepsChanged, onRequirementsChanged }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setDraft({ name: task.name, description: task.description, responsibleParty: task.responsible_party, rationale: task.rationale });
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    try {
      const updated = await api.updateTask(projectId, workOrderId, task.id, draft);
      onUpdated({ ...updated, dependencies: task.dependencies });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteTask(projectId, workOrderId, task.id);
      onDeleted(task.id);
    } finally {
      setBusy(false);
    }
  }

  async function removeDependency(depId) {
    await api.deleteTaskDependency(projectId, workOrderId, task.id, depId);
    onDepsChanged(task.id, task.dependencies.filter((d) => d.id !== depId));
  }

  const byId = Object.fromEntries(allTasks.map((t) => [t.id, t]));

  return (
    <div className="px-4 py-3 border-b border-border last:border-b-0">
      {editing ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              className="rounded-md border border-border bg-bg px-2 py-1 text-sm text-text w-56"
            />
            <input
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Description"
              className="rounded-md border border-border bg-bg px-2 py-1 text-sm text-text w-64"
            />
            <select
              value={draft.responsibleParty}
              onChange={(e) => setDraft((d) => ({ ...d, responsibleParty: e.target.value }))}
              className="rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
            >
              {RESPONSIBLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {RESPONSIBLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <input
            value={draft.rationale}
            onChange={(e) => setDraft((d) => ({ ...d, rationale: e.target.value }))}
            placeholder="Rationale (optional)"
            className="rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
          />
          <div>
            <button onClick={save} disabled={busy} className="text-xs font-medium text-accent mr-2">
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-xs font-medium text-text-secondary">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-text">{task.name}</p>
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-black/[0.05] text-text-secondary">
                {RESPONSIBLE_LABELS[task.responsible_party]}
              </span>
              <span
                className={[
                  'text-xs font-medium px-1.5 py-0.5 rounded',
                  task.status === 'approved' ? 'bg-accent/10 text-accent' : 'bg-black/[0.05] text-text-secondary',
                ].join(' ')}
              >
                {task.status}
              </span>
            </div>
            {task.description && <p className="text-xs text-text-secondary mt-0.5">{task.description}</p>}
            {task.rationale && <p className="text-xs text-text-secondary mt-0.5 italic">{task.rationale}</p>}
            {task.dependencies.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {task.dependencies.map((d) => (
                  <span
                    key={d.id}
                    className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 flex items-center gap-1"
                  >
                    depends on: {byId[d.depends_on_task_id]?.name || '?'}
                    <button onClick={() => removeDependency(d.id)} className="hover:text-red-600" title="Remove">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <DependencyPicker
              task={task}
              otherTasks={allTasks}
              projectId={projectId}
              workOrderId={workOrderId}
              onAdded={(dep) => onDepsChanged(task.id, [...task.dependencies, dep])}
            />
            {requirements.map((r) => (
              <RequirementRow
                key={r.id}
                requirement={r}
                projectId={projectId}
                workOrderId={workOrderId}
                onUpdated={(updated) => onRequirementsChanged(task.id, requirements.map((x) => (x.id === updated.id ? updated : x)))}
                onDeleted={(id) => onRequirementsChanged(task.id, requirements.filter((x) => x.id !== id))}
              />
            ))}
            <AddResourceRequirementForm
              task={task}
              projectId={projectId}
              workOrderId={workOrderId}
              onAdded={(req) => onRequirementsChanged(task.id, [...requirements, req])}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={startEdit} className="text-xs font-medium text-text-secondary hover:text-text">
              Edit
            </button>
            <button onClick={remove} disabled={busy} className="text-xs font-medium text-red-600">
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const POLL_INTERVAL_MS = 3000;

export default function TasksPanel({ projectId }) {
  const [workOrderId, setWorkOrderId] = useState(undefined);
  const [tasks, setTasks] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);
  const [approvedMsg, setApprovedMsg] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [showDiagram, setShowDiagram] = useState(false);
  const [generatingLineItems, setGeneratingLineItems] = useState(false);
  const [lineItemsMsg, setLineItemsMsg] = useState('');
  const [lineItemsError, setLineItemsError] = useState('');
  const [generatingResources, setGeneratingResources] = useState(false);
  const [resourceGenError, setResourceGenError] = useState('');

  function refreshTasks(woId) {
    return Promise.all([api.listTasks(projectId, woId), api.listResourceRequirements(projectId, woId)]).then(
      ([t, r]) => {
        setTasks(t);
        setRequirements(r);
      }
    );
  }

  useEffect(() => {
    let cancelled = false;
    api
      .getWorkOrderDraft(projectId)
      .then(async (draft) => {
        if (cancelled) return;
        const woId = draft?.id ?? null;
        setWorkOrderId(woId);
        if (!woId) return;
        await refreshTasks(woId);
        // Pick up an in-progress generation if the page was reloaded mid-run.
        const run = await api.getTaskGenerationStatus(projectId, woId);
        if (!cancelled && run?.status === 'running') setGenerating(true);
        const resourceRun = await api.getResourceRequirementGenerationStatus(projectId, woId);
        if (!cancelled && resourceRun?.status === 'running') setGeneratingResources(true);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // §3.1: opaque to the end user -- a loading state while it runs, then the
  // final result. Polling instead of a synchronous wait since a multi-round
  // generation run can take well past a typical request timeout.
  useEffect(() => {
    if (!generating || !workOrderId) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const run = await api.getTaskGenerationStatus(projectId, workOrderId);
        if (cancelled) return;
        if (run && run.status !== 'running') {
          setGenerating(false);
          if (run.status === 'error') setGenError(run.error_message || 'Task generation failed.');
          await refreshTasks(workOrderId);
        }
      } catch (err) {
        if (!cancelled) {
          setGenerating(false);
          setGenError(err.message);
        }
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generating, workOrderId]);

  async function handleGenerate() {
    setGenError('');
    try {
      await api.generateTasks(projectId, workOrderId);
      setGenerating(true);
    } catch (err) {
      setGenError(err.message);
    }
  }

  // Same opaque-background-process pattern as task generation above.
  useEffect(() => {
    if (!generatingResources || !workOrderId) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const run = await api.getResourceRequirementGenerationStatus(projectId, workOrderId);
        if (cancelled) return;
        if (run && run.status !== 'running') {
          setGeneratingResources(false);
          if (run.status === 'error') setResourceGenError(run.error_message || 'Resource requirement generation failed.');
          await refreshTasks(workOrderId);
        }
      } catch (err) {
        if (!cancelled) {
          setGeneratingResources(false);
          setResourceGenError(err.message);
        }
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatingResources, workOrderId]);

  async function handleGenerateResources() {
    setResourceGenError('');
    try {
      await api.generateResourceRequirements(projectId, workOrderId);
      setGeneratingResources(true);
    } catch (err) {
      setResourceGenError(err.message);
    }
  }

  function updateTaskInList(updated) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  async function handleApprove() {
    setApproving(true);
    setApprovedMsg('');
    try {
      const { approvedCount } = await api.approveTaskList(projectId, workOrderId);
      setTasks((prev) => prev.map((t) => (t.status === 'draft' ? { ...t, status: 'approved' } : t)));
      setApprovedMsg(`Approved ${approvedCount} task(s).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  }

  async function handleGenerateLineItems() {
    setGeneratingLineItems(true);
    setLineItemsMsg('');
    setLineItemsError('');
    try {
      const { lineItemCount } = await api.generateLineItemsFromResources(projectId, workOrderId);
      setLineItemsMsg(`Generated ${lineItemCount} line item(s) -- see the Work Order tab.`);
    } catch (err) {
      setLineItemsError(err.message);
    } finally {
      setGeneratingLineItems(false);
    }
  }

  const draftCount = tasks?.filter((t) => t.status === 'draft').length ?? 0;
  const requirementsByTask = (taskId) => requirements.filter((r) => r.task_id === taskId);

  return (
    <div className="h-full flex flex-col bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-text">Tasks</h2>
        <p className="text-xs text-text-secondary">Scoped, sequenced work for this project's draft work order</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {workOrderId === undefined && <p className="text-sm text-text-secondary">Loading…</p>}

        {workOrderId === null && (
          <p className="text-sm text-text-secondary py-4">
            Start a work order (in the Work Order tab) before adding tasks — tasks belong to the draft work order.
          </p>
        )}

        {workOrderId && tasks && (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="text-sm font-medium px-3 py-1.5 rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-60 transition-colors w-fit"
              >
                {generating ? 'Generating tasks…' : 'Generate Tasks'}
              </button>
              {generating && (
                <span className="text-xs text-text-secondary">
                  This can take a minute or two — feel free to check back.
                </span>
              )}
              {genError && <span className="text-xs text-red-600">{genError}</span>}
              {tasks.length > 0 && (
                <button
                  onClick={() => setShowDiagram((v) => !v)}
                  className="text-sm font-medium text-accent hover:underline w-fit"
                >
                  {showDiagram ? 'Hide diagram' : 'Show diagram'}
                </button>
              )}
            </div>

            {showDiagram && tasks.length > 0 && <TaskNetworkDiagram tasks={tasks} />}

            {tasks.length === 0 && !generating && (
              <p className="text-sm text-text-secondary py-4">
                No tasks yet — click "Generate Tasks" above, or add the first one by hand below.
              </p>
            )}
            {tasks.length > 0 && (
              <div className="bg-bg border border-border rounded-lg divide-y divide-border">
                {tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    allTasks={tasks}
                    requirements={requirementsByTask(task.id)}
                    projectId={projectId}
                    workOrderId={workOrderId}
                    onUpdated={updateTaskInList}
                    onDeleted={(id) => setTasks((prev) => prev.filter((t) => t.id !== id))}
                    onDepsChanged={(taskId, dependencies) =>
                      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, dependencies } : t)))
                    }
                    onRequirementsChanged={(taskId, taskRequirements) =>
                      setRequirements((prev) => [...prev.filter((r) => r.task_id !== taskId), ...taskRequirements])
                    }
                  />
                ))}
              </div>
            )}
            <AddTaskForm
              projectId={projectId}
              workOrderId={workOrderId}
              onAdded={(task) => setTasks((prev) => [...prev, task])}
            />
            {tasks.length > 0 && (
              <div className="pt-2 border-t border-border flex items-center gap-3">
                <button
                  onClick={handleApprove}
                  disabled={approving || draftCount === 0}
                  className="text-sm font-medium px-4 py-2 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-50 text-white transition-colors w-fit"
                >
                  {approving ? 'Approving…' : `Approve Task List${draftCount > 0 ? ` (${draftCount} draft)` : ''}`}
                </button>
                {approvedMsg && <span className="text-xs text-text-secondary">{approvedMsg}</span>}
              </div>
            )}
            {tasks.length > 0 && draftCount === 0 && (
              <div className="pt-2 border-t border-border flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleGenerateResources}
                  disabled={generatingResources}
                  className="text-sm font-medium px-3 py-1.5 rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-60 transition-colors w-fit"
                >
                  {generatingResources ? 'Estimating resources…' : 'Generate Resource Requirements'}
                </button>
                {generatingResources && (
                  <span className="text-xs text-text-secondary">This can take a minute or two.</span>
                )}
                {resourceGenError && <span className="text-xs text-red-600">{resourceGenError}</span>}
              </div>
            )}
            {tasks.length > 0 && draftCount === 0 && (
              <div className="pt-2 border-t border-border flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleGenerateLineItems}
                  disabled={generatingLineItems || requirements.length === 0}
                  className="text-sm font-medium px-4 py-2 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-50 text-white transition-colors w-fit"
                >
                  {generatingLineItems ? 'Generating…' : 'Generate Line Items'}
                </button>
                {requirements.length === 0 && (
                  <span className="text-xs text-text-secondary">
                    Add resource requirements to each task above first, or use "Generate Resource Requirements" above.
                  </span>
                )}
                {lineItemsMsg && <span className="text-xs text-text-secondary">{lineItemsMsg}</span>}
                {lineItemsError && <span className="text-xs text-red-600">{lineItemsError}</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
