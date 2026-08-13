import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const TYPE_LABELS = { procedural: 'Procedural', semantic: 'Semantic' };

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
  const sourceRefs = proposal.type === 'semantic' ? proposal.source_refs : null;

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
            <p className="text-xs text-text-secondary mt-1">Source: {sourceRefs.join('; ')}</p>
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

const SOURCE_LABELS = { human_seeded: 'seeded', human_asserted: 'human-asserted', agent_inferred: 'agent-inferred' };

function ActiveRow({ entry }) {
  const text = entry.type === 'procedural' ? entry.instruction : entry.content;
  const sourceOrOrigin = entry.type === 'procedural' ? entry.source : entry.origin;
  const sourceRefs = entry.type === 'semantic' ? entry.source_refs : null;

  return (
    <div className="px-4 py-3 border-b border-border last:border-b-0">
      <TypeBadge type={entry.type} />
      <p className="text-sm text-text whitespace-pre-wrap">{text}</p>
      {sourceRefs?.length > 0 && (
        <p className="text-xs text-text-secondary mt-1">Source: {sourceRefs.join('; ')}</p>
      )}
      <p className="text-xs text-text-secondary mt-1">
        {SOURCE_LABELS[sourceOrOrigin] || sourceOrOrigin}
        {entry.type === 'semantic' ? ` · ${entry.status}` : ''}
      </p>
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
    </div>
  );
}
