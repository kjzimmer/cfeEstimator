import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

function NewProjectForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const project = await api.createProject({ name, customer });
      setName('');
      setCustomer('');
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
        <input
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>
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
                <p className="text-xs text-text-secondary">{p.customer || 'No customer set'}</p>
              </div>
              <span className="text-xs font-mono text-text-secondary">{p.status || '—'}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
