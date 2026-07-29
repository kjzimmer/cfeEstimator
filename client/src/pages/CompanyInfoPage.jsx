import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function CompanyInfoPage() {
  const { user } = useAuth();
  const [sections, setSections] = useState(null);
  const [activeKey, setActiveKey] = useState(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .listCompanyInfo()
      .then((rows) => {
        setSections(rows);
        setActiveKey(rows[0]?.section_key ?? null);
        setDraft(rows[0]?.content ?? '');
      })
      .catch((err) => setError(err.message));
  }, []);

  const active = sections?.find((s) => s.section_key === activeKey);

  function selectSection(section) {
    setActiveKey(section.section_key);
    setDraft(section.content);
    setSavedAt(null);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateCompanyInfoSection(activeKey, draft);
      setSections((prev) => prev.map((s) => (s.section_key === activeKey ? updated : s)));
      setSavedAt(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!sections) return <p className="text-sm text-text-secondary">Loading…</p>;

  return (
    <div className="grid grid-cols-[220px_1fr] gap-6">
      <nav className="flex flex-col gap-1">
        {sections.map((s) => (
          <button
            key={s.section_key}
            onClick={() => selectSection(s)}
            className={[
              'text-left px-3 py-2 rounded-md text-sm font-medium transition-colors',
              s.section_key === activeKey
                ? 'bg-accent/10 text-accent'
                : 'text-text-secondary hover:text-text hover:bg-black/[0.03]',
            ].join(' ')}
          >
            {s.title}
          </button>
        ))}
      </nav>

      {active && (
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-text">{active.title}</h2>
            {user?.isAdmin && (
              <div className="flex items-center gap-3">
                {savedAt && <span className="text-xs text-text-secondary">Saved</span>}
                <button
                  onClick={handleSave}
                  disabled={saving || draft === active.content}
                  className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-50 text-white transition-colors"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>

          <textarea
            value={draft}
            onChange={(e) => {
              if (!user?.isAdmin) return;
              setDraft(e.target.value);
              setSavedAt(null);
            }}
            readOnly={!user?.isAdmin}
            placeholder="Not yet configured — coming soon. Add this section's content here."
            rows={16}
            className={[
              'w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text font-mono leading-relaxed resize-y',
              user?.isAdmin
                ? 'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent'
                : 'cursor-default',
            ].join(' ')}
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
