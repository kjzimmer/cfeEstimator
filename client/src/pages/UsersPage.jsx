import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

function NewUserForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const user = await api.createUser({ email, password, name, isAdmin });
      setEmail('');
      setPassword('');
      setName('');
      setIsAdmin(false);
      setOpen(false);
      onCreated(user);
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
        Add user
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-3 w-full max-w-md"
    >
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-text">
        <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
        Admin
      </label>
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

export default function UsersPage() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api.listUsers().then(setUsers).catch((err) => setError(err.message));
  }, []);

  async function toggleActive(user) {
    setBusyId(user.id);
    setError('');
    try {
      const updated = await api.updateUser(user.id, {
        name: user.name,
        isAdmin: user.is_admin,
        isActive: !user.is_active,
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleAdmin(user) {
    setBusyId(user.id);
    setError('');
    try {
      const updated = await api.updateUser(user.id, {
        name: user.name,
        isAdmin: !user.is_admin,
        isActive: user.is_active,
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text">Users</h1>
        <NewUserForm onCreated={(u) => setUsers((prev) => [...(prev || []), u])} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {users && (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-text">
                  {u.name}
                  {!u.is_active && (
                    <span className="ml-2 text-xs font-normal text-text-secondary">(deactivated)</span>
                  )}
                </p>
                <p className="text-xs text-text-secondary">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleAdmin(u)}
                  disabled={busyId === u.id}
                  className={[
                    'text-xs font-medium px-2.5 py-1 rounded-md border transition-colors disabled:opacity-50',
                    u.is_admin
                      ? 'bg-accent/10 text-accent border-accent/30'
                      : 'text-text-secondary border-border hover:text-text',
                  ].join(' ')}
                >
                  {u.is_admin ? 'Admin' : 'Make admin'}
                </button>
                <button
                  onClick={() => toggleActive(u)}
                  disabled={busyId === u.id}
                  className="text-xs font-medium px-2.5 py-1 rounded-md border border-border text-text-secondary hover:text-text transition-colors disabled:opacity-50"
                >
                  {u.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
