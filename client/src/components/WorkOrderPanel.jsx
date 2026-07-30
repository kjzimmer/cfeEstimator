import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import FileViewerModal from './FileViewerModal.jsx';

const RATE_CARD_OPTIONS = [
  { key: 'service_rates', label: 'Service Rate Card' },
  { key: 'material_costs', label: 'Material Cost Card' },
  { key: 'equipment_rates', label: 'Equipment/Asset Rate Card' },
  { key: 'employee_role_rates', label: 'Employee Role Rate Card' },
];

function money(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function LineItemForm({ projectId, workOrderId, onAdded }) {
  const [mode, setMode] = useState('catalog');
  const [cardType, setCardType] = useState(RATE_CARD_OPTIONS[0].key);
  const [catalogItems, setCatalogItems] = useState([]);
  const [itemId, setItemId] = useState('');
  const [manual, setManual] = useState({ name: '', unit: '', rate: '' });
  const [qty, setQty] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'catalog') return;
    api.listRateCardItems(cardType).then((items) => {
      setCatalogItems(items);
      setItemId(items[0]?.id ?? '');
    });
  }, [mode, cardType]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const payload =
        mode === 'catalog'
          ? { rateCardType: cardType, rateCardItemId: itemId, qty: Number(qty) || 1 }
          : { name: manual.name, unit: manual.unit, rate: Number(manual.rate) || 0, qty: Number(qty) || 1 };
      const item = await api.addWorkOrderLineItem(projectId, workOrderId, payload);
      setManual({ name: '', unit: '', rate: '' });
      setQty('1');
      onAdded(item);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 bg-bg border border-border rounded-md p-3">
      <div className="flex items-center gap-1 bg-surface border border-border rounded-md p-0.5 w-fit">
        {['catalog', 'manual'].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={[
              'px-2.5 py-1 rounded text-xs font-medium transition-colors',
              mode === m ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text',
            ].join(' ')}
          >
            {m === 'catalog' ? 'From rate card' : 'Manual'}
          </button>
        ))}
      </div>

      {mode === 'catalog' ? (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Card</label>
            <select
              value={cardType}
              onChange={(e) => setCardType(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text"
            >
              {RATE_CARD_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Item</label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text w-64"
            >
              {catalogItems.length === 0 && <option value="">No items configured</option>}
              {catalogItems.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name} ({it.unit}) — {money(it.rate)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Qty</label>
            <input
              type="number"
              step="0.01"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text w-20"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !itemId}
            className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-60 text-white transition-colors"
          >
            Add
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Description</label>
            <input
              value={manual.name}
              onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
              required
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text w-48"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Unit</label>
            <input
              value={manual.unit}
              onChange={(e) => setManual((m) => ({ ...m, unit: e.target.value }))}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text w-20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Qty</label>
            <input
              type="number"
              step="0.01"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text w-20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Rate</label>
            <input
              type="number"
              step="0.01"
              value={manual.rate}
              onChange={(e) => setManual((m) => ({ ...m, rate: e.target.value }))}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text w-24"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-60 text-white transition-colors"
          >
            Add
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

function LineItemRow({ projectId, workOrderId, item, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setDraft({ name: item.name, unit: item.unit, qty: item.qty, rate: item.rate });
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    try {
      const updated = await api.updateWorkOrderLineItem(projectId, workOrderId, item.id, {
        name: draft.name,
        unit: draft.unit,
        qty: Number(draft.qty) || 0,
        rate: Number(draft.rate) || 0,
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
      await api.deleteWorkOrderLineItem(projectId, workOrderId, item.id);
      onDeleted(item.id);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <tr className="border-t border-border">
        <td className="px-3 py-2">
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={draft.unit}
            onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
            className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            step="0.01"
            value={draft.qty}
            onChange={(e) => setDraft((d) => ({ ...d, qty: e.target.value }))}
            className="w-20 rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            step="0.01"
            value={draft.rate}
            onChange={(e) => setDraft((d) => ({ ...d, rate: e.target.value }))}
            className="w-24 rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
          />
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <button onClick={save} disabled={busy} className="text-xs font-medium text-accent mr-2">
            Save
          </button>
          <button onClick={() => setEditing(false)} className="text-xs font-medium text-text-secondary">
            Cancel
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 text-sm text-text">{item.name}</td>
      <td className="px-3 py-2 text-sm text-text-secondary">{item.unit}</td>
      <td className="px-3 py-2 text-sm text-text font-mono">{item.qty}</td>
      <td className="px-3 py-2 text-sm text-text font-mono">{money(item.rate)}</td>
      <td className="px-3 py-2 text-sm text-text font-mono">{money(item.amount)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <button onClick={startEdit} className="text-xs font-medium text-text-secondary hover:text-text mr-2">
          Edit
        </button>
        <button onClick={remove} disabled={busy} className="text-xs font-medium text-red-600">
          Delete
        </button>
      </td>
    </tr>
  );
}

function ProfitSummary({ projectId, woId }) {
  const [summary, setSummary] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    if (open) return setOpen(false);
    if (!summary) {
      try {
        setSummary(await api.getWorkOrderProfit(projectId, woId));
      } catch (err) {
        setError(err.message);
      }
    }
    setOpen(true);
  }

  return (
    <div className="mt-3">
      <button onClick={toggle} className="text-xs font-medium text-accent hover:underline">
        {open ? 'Hide' : 'View'} estimated profit
      </button>
      {open && error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {open && summary && (
        <div className="mt-2 bg-bg border border-border rounded-md p-3 text-xs">
          {summary.lines.map((l) => (
            <div key={l.id} className="flex justify-between py-0.5 text-text-secondary">
              <span>{l.name}</span>
              <span>{l.profit === null ? 'unknown cost' : money(l.profit)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-1 mt-1 border-t border-border font-medium text-text">
            <span>Estimated profit</span>
            <span>{money(summary.totalProfit)}</span>
          </div>
          {summary.unknownCostLineCount > 0 && (
            <p className="text-text-secondary mt-1">
              {summary.unknownCostLineCount} manual line(s) excluded (no cost on file).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DraftEditor({ projectId, isAdmin, workOrder, onChange, onFinalized }) {
  const [fields, setFields] = useState({
    scopeText: workOrder.scope_text,
    siteLocation: workOrder.site_location,
    requestedStart: workOrder.requested_start,
    contingencyPercent: workOrder.contingency_percent,
    terms: workOrder.terms,
  });
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState('');

  const dirty =
    fields.scopeText !== workOrder.scope_text ||
    fields.siteLocation !== workOrder.site_location ||
    fields.requestedStart !== workOrder.requested_start ||
    Number(fields.contingencyPercent) !== Number(workOrder.contingency_percent) ||
    fields.terms !== workOrder.terms;

  async function saveFields() {
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateWorkOrder(projectId, workOrder.id, fields);
      onChange(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalize() {
    setFinalizing(true);
    setError('');
    try {
      await api.finalizeWorkOrder(projectId, workOrder.id);
      onFinalized();
    } catch (err) {
      setError(err.message);
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-text-secondary mb-1">Scope of Work</label>
          <textarea
            value={fields.scopeText}
            onChange={(e) => setFields((f) => ({ ...f, scopeText: e.target.value }))}
            rows={4}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text leading-relaxed resize-y"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-text-secondary mb-1">Site Location</label>
          <input
            value={fields.siteLocation}
            onChange={(e) => setFields((f) => ({ ...f, siteLocation: e.target.value }))}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Requested Start</label>
          <input
            value={fields.requestedStart}
            onChange={(e) => setFields((f) => ({ ...f, requestedStart: e.target.value }))}
            placeholder="e.g. Week of August 11, 2026"
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Contingency %</label>
          <input
            type="number"
            step="0.1"
            value={fields.contingencyPercent}
            onChange={(e) => setFields((f) => ({ ...f, contingencyPercent: e.target.value }))}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-text-secondary mb-1">Terms</label>
          <textarea
            value={fields.terms}
            onChange={(e) => setFields((f) => ({ ...f, terms: e.target.value }))}
            rows={2}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text leading-relaxed resize-y"
          />
        </div>
      </div>
      {dirty && (
        <button
          onClick={saveFields}
          disabled={saving}
          className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-60 text-white transition-colors w-fit"
        >
          {saving ? 'Saving…' : 'Save details'}
        </button>
      )}

      <div>
        <h3 className="text-sm font-semibold text-text mb-2">Line Items</h3>
        {workOrder.lineItems.length > 0 && (
          <div className="overflow-x-auto mb-2">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Rate</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {workOrder.lineItems.map((item) => (
                  <LineItemRow
                    key={item.id}
                    projectId={projectId}
                    workOrderId={workOrder.id}
                    item={item}
                    onUpdated={(updated) =>
                      onChange({
                        ...workOrder,
                        lineItems: workOrder.lineItems.map((li) => (li.id === updated.id ? { ...updated, amount: updated.qty * updated.rate } : li)),
                      })
                    }
                    onDeleted={(id) =>
                      onChange({ ...workOrder, lineItems: workOrder.lineItems.filter((li) => li.id !== id) })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <LineItemForm
          projectId={projectId}
          workOrderId={workOrder.id}
          onAdded={(item) =>
            onChange({ ...workOrder, lineItems: [...workOrder.lineItems, { ...item, amount: item.qty * item.rate }] })
          }
        />
      </div>

      <div className="flex flex-col items-end gap-1 text-sm text-text pt-2 border-t border-border">
        <div className="flex justify-between w-64">
          <span className="text-text-secondary">Subtotal</span>
          <span className="font-mono">{money(workOrder.subtotal)}</span>
        </div>
        <div className="flex justify-between w-64">
          <span className="text-text-secondary">Contingency ({Number(fields.contingencyPercent)}%)</span>
          <span className="font-mono">{money(workOrder.contingencyAmount)}</span>
        </div>
        <div className="flex justify-between w-64 font-semibold">
          <span>Total</span>
          <span className="font-mono">{money(workOrder.total)}</span>
        </div>
      </div>

      {isAdmin && <ProfitSummary projectId={projectId} woId={workOrder.id} />}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={handleFinalize}
        disabled={finalizing || workOrder.lineItems.length === 0}
        className="text-sm font-medium px-4 py-2 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-50 text-white transition-colors w-fit"
      >
        {finalizing ? 'Generating…' : 'Generate Work Order'}
      </button>
    </div>
  );
}

export default function WorkOrderPanel({ projectId, isAdmin }) {
  const [draft, setDraft] = useState(undefined);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);

  async function load() {
    const [d, h] = await Promise.all([api.getWorkOrderDraft(projectId), api.listWorkOrders(projectId)]);
    setDraft(d);
    setHistory(h);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getWorkOrderDraft(projectId), api.listWorkOrders(projectId)])
      .then(([d, h]) => {
        if (cancelled) return;
        setDraft(d);
        setHistory(h);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const mostRecentFinalized = history?.find((wo) => wo.status === 'finalized');

  async function startDraft() {
    setBusy(true);
    setError('');
    try {
      await api.createWorkOrderDraft(projectId);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createRevision() {
    setBusy(true);
    setError('');
    try {
      await api.reviseWorkOrder(projectId, mostRecentFinalized.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (draft === undefined || history === null) {
    return (
      <div className="h-full flex flex-col bg-surface border border-border rounded-lg overflow-hidden">
        <p className="px-4 py-8 text-sm text-text-secondary text-center">Loading…</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-text">Work Order</h2>
        <p className="text-xs text-text-secondary">Drafted from the rate cards, finalized as a PDF when ready</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {draft && (
          <DraftEditor
            projectId={projectId}
            isAdmin={isAdmin}
            workOrder={draft}
            onChange={setDraft}
            onFinalized={load}
          />
        )}

        {!draft && mostRecentFinalized && (
          <div className="flex flex-col gap-3">
            <div className="bg-bg border border-border rounded-md p-3">
              <p className="text-sm font-medium text-text">
                Revision {mostRecentFinalized.revision} — {money(mostRecentFinalized.total)}
              </p>
              <p className="text-xs text-text-secondary">
                Finalized {new Date(mostRecentFinalized.finalized_at).toLocaleString()}
              </p>
              {mostRecentFinalized.file_id && (
                <button
                  onClick={() =>
                    setViewingFile({ fileId: mostRecentFinalized.file_id, filename: `Work Order v${mostRecentFinalized.revision}.pdf` })
                  }
                  className="text-xs font-medium text-accent hover:underline mt-1"
                >
                  View PDF
                </button>
              )}
            </div>
            <button
              onClick={createRevision}
              disabled={busy}
              className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-60 text-white transition-colors w-fit"
            >
              Create Revision
            </button>
          </div>
        )}

        {!draft && !mostRecentFinalized && (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-text-secondary text-center">
              No work order yet — the agent may draft one from the conversation, or start one manually.
            </p>
            <button
              onClick={startDraft}
              disabled={busy}
              className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-60 text-white transition-colors"
            >
              Start Work Order
            </button>
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">History</h3>
            <div className="flex flex-col gap-1">
              {history.map((wo) => (
                <div key={wo.id} className="flex items-center justify-between text-xs text-text-secondary py-1">
                  <span>
                    Revision {wo.revision} · {wo.status}
                  </span>
                  <span className="font-mono">{money(wo.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {viewingFile && (
        <FileViewerModal
          projectId={projectId}
          fileId={viewingFile.fileId}
          filename={viewingFile.filename}
          onClose={() => setViewingFile(null)}
        />
      )}
    </div>
  );
}
