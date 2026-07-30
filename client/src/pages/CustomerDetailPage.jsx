import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'address', label: 'Address' },
  { key: 'primaryContactName', dbKey: 'primary_contact_name', label: 'Primary contact' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
];

function toDraft(customer) {
  const draft = {};
  for (const f of FIELDS) draft[f.key] = customer[f.dbKey ?? f.key] ?? '';
  draft.notes = customer.notes ?? '';
  return draft;
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [draft, setDraft] = useState(null);
  const [projects, setProjects] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getCustomer(id), api.listCustomerProjects(id)]).then(([c, p]) => {
      if (cancelled) return;
      setCustomer(c);
      setDraft(toDraft(c));
      setProjects(p);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateCustomer(id, draft);
      setCustomer(updated);
      setDraft(toDraft(updated));
      setSavedAt(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!customer || !draft) return <p className="text-sm text-text-secondary">Loading…</p>;

  const dirty = FIELDS.some((f) => draft[f.key] !== (customer[f.dbKey ?? f.key] ?? '')) || draft.notes !== (customer.notes ?? '');

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <Link to="/customers" className="text-xs text-text-secondary hover:text-text">
          ← Customers
        </Link>
        <h1 className="text-lg font-semibold text-text">{customer.name}</h1>
      </div>

      <div className="bg-surface border border-border rounded-lg p-6 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key} className={f.key === 'address' ? 'col-span-2' : ''}>
              <label className="block text-xs font-medium text-text-secondary mb-1">{f.label}</label>
              <input
                value={draft[f.key]}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, [f.key]: e.target.value }));
                  setSavedAt(null);
                }}
                required={f.required}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
            </div>
          ))}
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Notes</label>
          <textarea
            value={draft.notes}
            onChange={(e) => {
              setDraft((d) => ({ ...d, notes: e.target.value }));
              setSavedAt(null);
            }}
            rows={4}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !dirty || !draft.name}
            className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-50 text-white transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {savedAt && <span className="text-xs text-text-secondary">Saved</span>}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-text mb-2">Project history</h2>
        {projects && projects.length === 0 && (
          <p className="text-sm text-text-secondary">No projects for this customer yet.</p>
        )}
        {projects && projects.length > 0 && (
          <div className="bg-surface border border-border rounded-lg divide-y divide-border">
            {projects.map((p) => (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-black/[0.02] transition-colors"
              >
                <p className="text-sm font-medium text-text">{p.name}</p>
                <span className="text-xs font-mono text-text-secondary">
                  {p.historical ? 'Historical' : p.status || '—'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
