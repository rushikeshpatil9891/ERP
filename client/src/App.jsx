import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ClipboardList, FileText, PackageCheck, LogOut } from 'lucide-react';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Enquiries from './pages/Enquiries.jsx';
import Quotations from './pages/Quotations.jsx';
import SalesOrders from './pages/SalesOrders.jsx';

export default function App() {
  const { user, logout } = useAuth();
  if (!user) return <Login />;
  const nav = [
    { to: '/enquiries', label: 'Enquiries', icon: ClipboardList },
    { to: '/quotations', label: 'Quotations', icon: FileText },
    { to: '/orders', label: 'Sales Orders', icon: PackageCheck },
  ];
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><span className="mark" aria-hidden="true" />Foundry<small>ERP</small></div>
        <nav>
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="me">
          <div className="avatar">{user.name[0]}</div>
          <div><b>{user.name}</b><span>{user.role === 'ADMIN' ? 'Admin' : 'Sales'}</span></div>
          <button className="icon-btn" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/enquiries" element={<Enquiries />} />
          <Route path="/quotations" element={<Quotations />} />
          <Route path="/orders" element={<SalesOrders />} />
          <Route path="*" element={<Navigate to={user.role === 'ADMIN' ? '/orders' : '/enquiries'} replace />} />
        </Routes>
      </main>
    </div>
  );
}
