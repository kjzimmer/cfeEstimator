import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

function NewCustomerForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [primaryContactName, setPrimaryContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const customer = await api.createCustomer({ name, address, primaryContactName, phone, email });
      setName('');
      setAddress('');
      setPrimaryContactName('');
      setPhone('');
      setEmail('');
      setOpen(false);
      onCreated(customer);
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
        New customer
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
        <label className="block text-xs font-medium text-text-secondary mb-1">Address</label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Primary contact</label>
          <input
            value={primaryContactName}
            onChange={(e) => setPrimaryContactName(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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

export default function CustomersListPage() {
  const [customers, setCustomers] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listCustomers().then(setCustomers).catch((err) => setError(err.message));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text">Customers</h1>
        <NewCustomerForm onCreated={(c) => setCustomers((prev) => [...(prev || []), c])} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {customers && customers.length === 0 && (
        <p className="text-sm text-text-secondary py-8 text-center">
          No customers yet — create the first one.
        </p>
      )}

      {customers && customers.length > 0 && (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {customers.map((c) => (
            <Link
              key={c.id}
              to={`/customers/${c.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-black/[0.02] transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-text">{c.name}</p>
                <p className="text-xs text-text-secondary">
                  {c.primary_contact_name || 'No contact set'}
                </p>
              </div>
              <span className="text-xs text-text-secondary">{c.phone}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
