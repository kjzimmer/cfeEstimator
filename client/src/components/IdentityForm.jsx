import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const FIELDS = [
  { key: 'companyName', dbKey: 'company_name', label: 'Company name' },
  { key: 'address', dbKey: 'address', label: 'Address' },
  { key: 'phone', dbKey: 'phone', label: 'Phone' },
  { key: 'email', dbKey: 'email', label: 'Email' },
  { key: 'website', dbKey: 'website', label: 'Website' },
];

function toDraft(identity) {
  const draft = {};
  for (const f of FIELDS) draft[f.key] = identity?.[f.dbKey] ?? '';
  return draft;
}

export default function IdentityForm({ isAdmin }) {
  const [identity, setIdentity] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getIdentity()
      .then((data) => {
        setIdentity(data);
        setDraft(toDraft(data));
      })
      .catch((err) => setError(err.message));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateIdentity(draft);
      setIdentity(updated);
      setDraft(toDraft(updated));
      setSavedAt(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !identity) return <p className="text-sm text-red-600">{error}</p>;
  if (!draft) return <p className="text-sm text-text-secondary">Loading…</p>;

  const isEmpty = FIELDS.every((f) => !identity[f.dbKey]);
  const dirty = FIELDS.some((f) => draft[f.key] !== (identity[f.dbKey] ?? ''));

  return (
    <div className="flex flex-col gap-3">
      {isEmpty && !isAdmin && (
        <p className="text-sm text-text-secondary py-2">Not yet configured — coming soon.</p>
      )}
      <div className="grid grid-cols-2 gap-3 max-w-xl">
        {FIELDS.map((f) => (
          <div key={f.key} className={f.key === 'address' ? 'col-span-2' : ''}>
            <label className="block text-xs font-medium text-text-secondary mb-1">{f.label}</label>
            <input
              value={draft[f.key]}
              onChange={(e) => {
                if (!isAdmin) return;
                setDraft((d) => ({ ...d, [f.key]: e.target.value }));
                setSavedAt(null);
              }}
              readOnly={!isAdmin}
              placeholder={isAdmin ? '' : '—'}
              className={[
                'w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text',
                isAdmin
                  ? 'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent'
                  : 'cursor-default',
              ].join(' ')}
            />
          </div>
        ))}
      </div>
      {isAdmin && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-50 text-white transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {savedAt && <span className="text-xs text-text-secondary">Saved</span>}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
