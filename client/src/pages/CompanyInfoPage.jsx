import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import IdentityForm from '../components/IdentityForm.jsx';
import RateCardTable from '../components/RateCardTable.jsx';

// Fixed set of Company Info sections -- structured vs. freeform per
// docs/requirements/company-info.md. Drives the nav directly; freeform
// sections' content still comes from company_info_sections.
const SECTIONS = [
  { key: 'identity', title: 'Identity', kind: 'identity' },
  { key: 'products_services', title: 'Products & Services', kind: 'freeform' },
  { key: 'equipment_rates', title: 'Equipment/Asset Rate Card', kind: 'rateCard' },
  { key: 'employee_base', title: 'Employee Base', kind: 'freeform' },
  { key: 'employee_role_rates', title: 'Employee Role Rate Card', kind: 'rateCard' },
  { key: 'service_rates', title: 'Service Rate Card', kind: 'rateCard' },
  { key: 'material_costs', title: 'Material Cost Card', kind: 'rateCard' },
];

function FreeformEditor({ sectionKey, isAdmin }) {
  const [section, setSection] = useState(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setSection(null);
    setSavedAt(null);
    setError('');
    api
      .getCompanyInfoSection(sectionKey)
      .then((s) => {
        if (cancelled) return;
        setSection(s);
        setDraft(s.content);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [sectionKey]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateCompanyInfoSection(sectionKey, draft);
      setSection(updated);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !section) return <p className="text-sm text-red-600">{error}</p>;
  if (!section) return <p className="text-sm text-text-secondary">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
      {isAdmin && (
        <div className="flex items-center gap-3 justify-end">
          {savedAt && <span className="text-xs text-text-secondary">Saved</span>}
          <button
            onClick={handleSave}
            disabled={saving || draft === section.content}
            className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-50 text-white transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
      <textarea
        value={draft}
        onChange={(e) => {
          if (!isAdmin) return;
          setDraft(e.target.value);
          setSavedAt(null);
        }}
        readOnly={!isAdmin}
        placeholder="Not yet configured — coming soon. Add this section's content here."
        rows={16}
        className={[
          'w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text font-mono leading-relaxed resize-y',
          isAdmin
            ? 'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent'
            : 'cursor-default',
        ].join(' ')}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default function CompanyInfoPage() {
  const { user } = useAuth();
  const [activeKey, setActiveKey] = useState(SECTIONS[0].key);
  const active = SECTIONS.find((s) => s.key === activeKey);
  const isAdmin = Boolean(user?.isAdmin);

  return (
    <div className="grid grid-cols-[240px_1fr] gap-6">
      <nav className="flex flex-col gap-1">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveKey(s.key)}
            className={[
              'text-left px-3 py-2 rounded-md text-sm font-medium transition-colors',
              s.key === activeKey
                ? 'bg-accent/10 text-accent'
                : 'text-text-secondary hover:text-text hover:bg-black/[0.03]',
            ].join(' ')}
          >
            {s.title}
          </button>
        ))}
      </nav>

      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-base font-semibold text-text mb-4">{active.title}</h2>
        {active.kind === 'identity' && <IdentityForm isAdmin={isAdmin} />}
        {active.kind === 'freeform' && <FreeformEditor sectionKey={active.key} isAdmin={isAdmin} />}
        {active.kind === 'rateCard' && <RateCardTable sectionKey={active.key} isAdmin={isAdmin} />}
      </div>
    </div>
  );
}
