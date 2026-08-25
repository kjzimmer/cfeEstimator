import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const EMPTY_DRAFT = { name: '', unit: '', rate: '', cost: '' };

function AddRowForm({ sectionKey, isAdmin, onAdded }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isAdmin) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const item = await api.createRateCardItem(sectionKey, {
        name: draft.name,
        unit: draft.unit,
        rate: Number(draft.rate) || 0,
        cost: Number(draft.cost) || 0,
      });
      setDraft(EMPTY_DRAFT);
      setOpen(false);
      onAdded(item);
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
        className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white transition-colors"
      >
        Add row
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 bg-bg border border-border rounded-md p-3">
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          required
          autoFocus
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text w-48 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Unit</label>
        <input
          value={draft.unit}
          onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text w-24 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Rate</label>
        <input
          type="number"
          step="0.01"
          value={draft.rate}
          onChange={(e) => setDraft((d) => ({ ...d, rate: e.target.value }))}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text w-24 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Cost</label>
        <input
          type="number"
          step="0.01"
          value={draft.cost}
          onChange={(e) => setDraft((d) => ({ ...d, cost: e.target.value }))}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text w-24 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-60 text-white transition-colors"
      >
        {submitting ? 'Adding…' : 'Add'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-sm font-medium px-3 py-1.5 rounded-md text-text-secondary hover:text-text hover:bg-black/[0.03] transition-colors"
      >
        Cancel
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}

function ItemRow({ item, sectionKey, isAdmin, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function startEdit() {
    setDraft({ name: item.name, unit: item.unit, rate: item.rate, cost: item.cost ?? '' });
    setEditing(true);
  }

  async function handleSave() {
    setBusy(true);
    setError('');
    try {
      const updated = await api.updateRateCardItem(sectionKey, item.id, {
        name: draft.name,
        unit: draft.unit,
        rate: Number(draft.rate) || 0,
        cost: Number(draft.cost) || 0,
      });
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteRateCardItem(sectionKey, item.id);
      onDeleted(item.id);
    } catch (err) {
      setError(err.message);
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
            value={draft.rate}
            onChange={(e) => setDraft((d) => ({ ...d, rate: e.target.value }))}
            className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
          />
        </td>
        {isAdmin && (
          <td className="px-3 py-2">
            <input
              type="number"
              step="0.01"
              value={draft.cost}
              onChange={(e) => setDraft((d) => ({ ...d, cost: e.target.value }))}
              className="w-full rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
            />
          </td>
        )}
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <button
            onClick={handleSave}
            disabled={busy}
            className="text-xs font-medium px-2 py-1 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-60 text-white transition-colors mr-1"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-xs font-medium px-2 py-1 rounded-md text-text-secondary hover:text-text hover:bg-black/[0.03] transition-colors"
          >
            Cancel
          </button>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 text-sm text-text">{item.name}</td>
      <td className="px-3 py-2 text-sm text-text-secondary">{item.unit}</td>
      <td className="px-3 py-2 text-sm text-text font-mono">{item.rate}</td>
      {isAdmin && <td className="px-3 py-2 text-sm text-text font-mono">{item.cost}</td>}
      {isAdmin && (
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <button
            onClick={startEdit}
            className="text-xs font-medium px-2 py-1 rounded-md text-text-secondary hover:text-text hover:bg-black/[0.03] transition-colors mr-1"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="text-xs font-medium px-2 py-1 rounded-md text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
          >
            Delete
          </button>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </td>
      )}
    </tr>
  );
}

function QuickbooksSyncButton({ isAdmin, onSynced }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  if (!isAdmin) return null;

  async function handleSync() {
    setSyncing(true);
    setError('');
    setResult(null);
    try {
      const summary = await api.syncQuickbooksRates();
      setResult(summary);
      onSynced();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="text-sm font-medium px-3 py-1.5 rounded-md border border-border text-text-secondary hover:text-text hover:bg-black/[0.03] transition-colors disabled:opacity-60"
      >
        {syncing ? 'Syncing…' : 'Sync from QuickBooks (simulated)'}
      </button>
      {result && (
        <span className="text-xs text-text-secondary">
          {result.createdCount} added, {result.updatedCount} updated (across all rate cards)
        </span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

export default function RateCardTable({ sectionKey, isAdmin }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  function load() {
    return api.listRateCardItems(sectionKey).then(setItems);
  }

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError('');
    api
      .listRateCardItems(sectionKey)
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [sectionKey]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!items) return <p className="text-sm text-text-secondary">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
      <QuickbooksSyncButton isAdmin={isAdmin} onSynced={load} />
      {items.length === 0 ? (
        <p className="text-sm text-text-secondary py-4">
          Not yet configured — coming soon.{isAdmin && ' Add the first row below.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Rate</th>
                {isAdmin && <th className="px-3 py-2">Cost</th>}
                {isAdmin && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  sectionKey={sectionKey}
                  isAdmin={isAdmin}
                  onUpdated={(updated) =>
                    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
                  }
                  onDeleted={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AddRowForm
        sectionKey={sectionKey}
        isAdmin={isAdmin}
        onAdded={(item) => setItems((prev) => [...prev, item])}
      />
    </div>
  );
}
