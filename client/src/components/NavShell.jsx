import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const NAV_ITEMS = [
  { to: '/projects', label: 'Projects' },
  { to: '/customers', label: 'Customers' },
  { to: '/company-info', label: 'Company Info' },
  { to: '/users', label: 'Users', adminOnly: true },
];

function navLinkClass({ isActive }) {
  return [
    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
    isActive
      ? 'bg-accent/10 text-accent'
      : 'text-text-secondary hover:text-text hover:bg-black/[0.03]',
  ].join(' ');
}

export default function NavShell() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="sticky top-0 z-10 border-b border-border bg-surface">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent" />
              <span className="font-semibold text-sm text-text tracking-tight">CFE Estimator</span>
            </div>
            <nav className="flex items-center gap-1">
              {NAV_ITEMS.filter((item) => !item.adminOnly || user?.isAdmin).map((item) => (
                <NavLink key={item.to} to={item.to} className={navLinkClass}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-text-secondary">{user?.name}</span>
            <button
              onClick={logout}
              className="text-sm text-text-secondary hover:text-text px-2 py-1 rounded-md hover:bg-black/[0.03] transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
