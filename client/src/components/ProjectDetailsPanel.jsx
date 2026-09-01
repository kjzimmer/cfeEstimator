import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const inputClass =
  'w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent';

export default function ProjectDetailsPanel({ project, onUpdated }) {
  const [customers, setCustomers] = useState(null);
  const [name, setName] = useState(project.name);
  const [customerId, setCustomerId] = useState(project.customer_id ?? '');
  const [status, setStatus] = useState(project.status || '');
  const [sameAsCustomer, setSameAsCustomer] = useState(project.job_site_same_as_customer !== false);
  const [jobSiteAddress, setJobSiteAddress] = useState(project.job_site_address || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.listCustomers().then(setCustomers).catch((err) => setError(err.message));
  }, []);

  // Keep the form in sync if the project prop changes from elsewhere (e.g.
  // switching tabs and back after a conversation update touched the record).
  useEffect(() => {
    setName(project.name);
    setCustomerId(project.customer_id ?? '');
    setStatus(project.status || '');
    setSameAsCustomer(project.job_site_same_as_customer !== false);
    setJobSiteAddress(project.job_site_address || '');
  }, [project]);

  const selectedCustomer = customers?.find((c) => String(c.id) === String(customerId));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const updated = await api.updateProject(project.id, {
        name,
        customerId: customerId ? Number(customerId) : null,
        status,
        jobSiteSameAsCustomer: sameAsCustomer,
        jobSiteAddress,
      });
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-text">Project Details</h2>
        <p className="text-xs text-text-secondary">Name, customer, and where the work actually happens</p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Project name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputClass}>
            <option value="">No customer</option>
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {selectedCustomer?.address && (
            <p className="text-xs text-text-secondary mt-1">Billing address: {selectedCustomer.address}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Status</label>
          <input value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass} />
        </div>

        <div className="pt-2 border-t border-border">
          <p className="block text-xs font-medium text-text-secondary mb-2">Job site address</p>
          <p className="text-xs text-text-secondary mb-2">
            Used for distance/mobilization reasoning throughout the app — keep this accurate even if it differs
            from where the customer receives billing.
          </p>
          <label className="flex items-center gap-2 text-sm text-text mb-2">
            <input
              type="radio"
              name="jobSiteMode"
              checked={sameAsCustomer}
              onChange={() => setSameAsCustomer(true)}
            />
            Same as customer address{selectedCustomer?.address ? ` (${selectedCustomer.address})` : ''}
          </label>
          <label className="flex items-center gap-2 text-sm text-text mb-2">
            <input
              type="radio"
              name="jobSiteMode"
              checked={!sameAsCustomer}
              onChange={() => setSameAsCustomer(false)}
            />
            Different job site
          </label>
          {!sameAsCustomer && (
            <input
              value={jobSiteAddress}
              onChange={(e) => setJobSiteAddress(e.target.value)}
              placeholder="Job site address"
              className={inputClass}
            />
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-2 mt-auto pt-2">
          <button
            type="submit"
            disabled={saving}
            className="text-sm font-medium px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-60 text-white transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saved && <span className="text-xs text-text-secondary">Saved</span>}
        </div>
      </form>
    </div>
  );
}
