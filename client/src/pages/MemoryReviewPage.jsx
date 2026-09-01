import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const TYPE_LABELS = { procedural: 'Procedural', semantic: 'Semantic' };

// source_refs holds a mix of shapes across the app: plain strings (the
// original human-intake citation, e.g. "Alex Admin stated... in X project")
// and typed objects (e.g. { type: 'task_resource_requirement', id: 23 }, the
// shape tasks/resource requirements already use for citations). Format both
// rather than assuming one -- an un-formatted object renders as
// "[object Object]", which is what surfaced this in the first place.
function formatSourceRef(ref) {
  if (typeof ref === 'string') return ref;
  if (ref && typeof ref === 'object') {
    const { type, id, ...rest } = ref;
    const extra = Object.entries(rest)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return [type, id != null ? `#${id}` : null, extra || null].filter(Boolean).join(' ');
  }
  return String(ref);
}

function TypeBadge({ type }) {
  return (
    <span
      className={[
        'inline-block text-xs font-medium px-2 py-0.5 rounded-md mb-1.5',
        type === 'procedural' ? 'bg-accent/10 text-accent' : 'bg-black/[0.05] text-text-secondary',
      ].join(' ')}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}

function ProposalRow({ proposal, onReviewed }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const text = proposal.type === 'procedural' ? proposal.instruction : proposal.content;
  const sourceRefs = proposal.source_refs;

  async function review(decision) {
    setBusy(true);
    setError('');
    try {
      await api.reviewMemoryEntry(proposal.type, proposal.id, decision);
      onReviewed(proposal);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-3 border-b border-border last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <TypeBadge type={proposal.type} />
          <p className="text-sm text-text whitespace-pre-wrap">{text}</p>
          {sourceRefs?.length > 0 && (
            <p className="text-xs text-text-secondary mt-1">Source: {sourceRefs.map(formatSourceRef).join('; ')}</p>
          )}
          <p className="text-xs text-text-secondary mt-1">
            Proposed {new Date(proposal.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => review('accept')}
            disabled={busy}
            className="text-xs font-medium px-2.5 py-1 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-50 text-white transition-colors"
          >
            Accept
          </button>
          <button
            onClick={() => review('reject')}
            disabled={busy}
            className="text-xs font-medium px-2.5 py-1 rounded-md border border-border text-text-secondary hover:text-text transition-colors disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

const SOURCE_LABELS = {
  human_seeded: 'seeded',
  human_asserted: 'human-asserted',
  agent_inferred: 'agent-inferred',
  agent_proposed: 'agent-proposed',
};

function ActiveRow({ entry }) {
  const text = entry.type === 'procedural' ? entry.instruction : entry.content;
  const sourceOrOrigin = entry.type === 'procedural' ? entry.source : entry.origin;
  const sourceRefs = entry.source_refs;

  return (
    <div className="px-4 py-3 border-b border-border last:border-b-0">
      <TypeBadge type={entry.type} />
      <p className="text-sm text-text whitespace-pre-wrap">{text}</p>
      {sourceRefs?.length > 0 && (
        <p className="text-xs text-text-secondary mt-1">Source: {sourceRefs.map(formatSourceRef).join('; ')}</p>
      )}
      <p className="text-xs text-text-secondary mt-1">
        {SOURCE_LABELS[sourceOrOrigin] || sourceOrOrigin} · {entry.status}
        {entry.evidence?.length > 0 ? ` · ${entry.evidence.length} instance${entry.evidence.length === 1 ? '' : 's'} observed` : ''}
      </p>
    </div>
  );
}

function RetiredRow({ entry }) {
  const text = entry.type === 'procedural' ? entry.instruction : entry.content;

  return (
    <div className="px-4 py-3 border-b border-border last:border-b-0 opacity-70">
      <TypeBadge type={entry.type} />
      <p className="text-sm text-text whitespace-pre-wrap">{text}</p>
      <p className="text-xs text-text-secondary mt-1">
        Rejected {entry.reviewed_at ? new Date(entry.reviewed_at).toLocaleString() : 'at unknown time'}
      </p>
    </div>
  );
}

function RetiredSection() {
  const [entries, setEntries] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    if (open) return setOpen(false);
    if (!entries) {
      try {
        setEntries(await api.listRetiredMemory());
      } catch (err) {
        setError(err.message);
      }
    }
    setOpen(true);
  }

  return (
    <div>
      <button onClick={toggle} className="text-sm font-medium text-accent hover:underline">
        {open ? 'Hide' : 'Show'} retired (rejected) entries
      </button>
      {open && error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      {open && entries && entries.length === 0 && (
        <p className="text-sm text-text-secondary py-4">Nothing's been rejected yet.</p>
      )}
      {open && entries && entries.length > 0 && (
        <div className="mt-2 bg-surface border border-border rounded-lg divide-y divide-border">
          {entries.map((e) => (
            <RetiredRow key={`${e.type}-${e.id}`} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MemoryReviewPage() {
  const [proposals, setProposals] = useState(null);
  const [active, setActive] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listMemoryProposals(), api.listActiveMemory()])
      .then(([p, a]) => {
        if (cancelled) return;
        setProposals(p);
        setActive(a);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleReviewed(proposal) {
    setProposals((prev) => prev.filter((p) => !(p.type === proposal.type && p.id === proposal.id)));
    setActive((prev) => {
      if (!prev) return prev;
      const key = proposal.type === 'procedural' ? 'procedural' : 'semantic';
      return { ...prev, [key]: [...prev[key], { ...proposal, status: proposal.type === 'procedural' ? 'active' : 'confirmed' }] };
    });
  }

  const activeEntries = active ? [...active.procedural, ...active.semantic] : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-text">Agent Memory</h1>
        <p className="text-xs text-text-secondary">
          What the agent has been told to remember, company-wide — pending proposals and what's already active.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <h2 className="text-sm font-semibold text-text mb-2">Pending review</h2>
        {proposals && proposals.length === 0 && (
          <p className="text-sm text-text-secondary py-4">Nothing pending review.</p>
        )}
        {proposals && proposals.length > 0 && (
          <div className="bg-surface border border-border rounded-lg divide-y divide-border">
            {proposals.map((p) => (
              <ProposalRow key={`${p.type}-${p.id}`} proposal={p} onReviewed={handleReviewed} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-text mb-2">Active — what the agent currently knows</h2>
        {activeEntries && activeEntries.length === 0 && (
          <p className="text-sm text-text-secondary py-4">Nothing active yet.</p>
        )}
        {activeEntries && activeEntries.length > 0 && (
          <div className="bg-surface border border-border rounded-lg divide-y divide-border">
            {activeEntries.map((e) => (
              <ActiveRow key={`${e.type}-${e.id}`} entry={e} />
            ))}
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-border">
        <RetiredSection />
      </div>
    </div>
  );
}
