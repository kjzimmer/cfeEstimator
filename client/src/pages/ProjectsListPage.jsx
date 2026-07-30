import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const QUICK_ADD_VALUE = '__quick_add__';

function NewProjectForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [customers, setCustomers] = useState(null);
  const [customerId, setCustomerId] = useState('');
  const [quickAddName, setQuickAddName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    api.listCustomers().then(setCustomers).catch((err) => setError(err.message));
  }, [open]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      let resolvedCustomerId = customerId ? Number(customerId) : null;
      if (customerId === QUICK_ADD_VALUE) {
        const customer = await api.createCustomer({ name: quickAddName });
        resolvedCustomerId = customer.id;
      }
      const project = await api.createProject({ name, customerId: resolvedCustomerId });
      setName('');
      setCustomerId('');
      setQuickAddName('');
      setOpen(false);
      onCreated(project);
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
        New project
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-3 w-full max-w-md"
    >
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Project name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Customer</label>
        <select
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        >
          <option value="">No customer</option>
          {customers?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={QUICK_ADD_VALUE}>+ New customer…</option>
        </select>
      </div>
      {customerId === QUICK_ADD_VALUE && (
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">New customer name</label>
          <input
            value={quickAddName}
            onChange={(e) => setQuickAddName(e.target.value)}
            required
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
          <p className="text-xs text-text-secondary mt-1">
            Full contact details can be added from the customer's page later.
          </p>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-60 text-white transition-colors"
        >
          {submitting ? 'Creating…' : 'Create'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-medium px-3 py-1.5 rounded-md text-text-secondary hover:text-text hover:bg-black/[0.03] transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function ProjectsListPage() {
  const [projects, setProjects] = useState(null);
  const [showHistorical, setShowHistorical] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .listProjects(showHistorical ? true : undefined)
      .then(setProjects)
      .catch((err) => setError(err.message));
  }, [showHistorical]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-surface border border-border rounded-md p-0.5">
          <button
            onClick={() => setShowHistorical(false)}
            className={[
              'px-3 py-1.5 rounded text-sm font-medium transition-colors',
              !showHistorical ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text',
            ].join(' ')}
          >
            Current
          </button>
          <button
            onClick={() => setShowHistorical(true)}
            className={[
              'px-3 py-1.5 rounded text-sm font-medium transition-colors',
              showHistorical ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text',
            ].join(' ')}
          >
            Historical
          </button>
        </div>
        <NewProjectForm onCreated={(p) => setProjects((prev) => [p, ...(prev || [])])} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {projects && projects.length === 0 && (
        <p className="text-sm text-text-secondary py-8 text-center">
          {showHistorical ? 'No historical projects yet.' : 'No projects yet — create the first one.'}
        </p>
      )}

      {projects && projects.length > 0 && (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-black/[0.02] transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-text">{p.name}</p>
                <p className="text-xs text-text-secondary">{p.customer_name || 'No customer set'}</p>
              </div>
              <span className="text-xs font-mono text-text-secondary">{p.status || '—'}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
