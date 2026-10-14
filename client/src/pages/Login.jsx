import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { Field } from '../ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(email, password); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const fill = (e, p) => { setEmail(e); setPassword(p); };

  return (
    <div className="login">
      <section className="login-art">
        <div className="brand big"><span className="mark" aria-hidden="true" />Foundry<small>ERP</small></div>
        <h1>From enquiry to dispatch, every unit accounted for.</h1>
        <ol className="flow">
          <li>Enquiry</li><li>Quotation</li><li>Sales order</li><li>Stock reserved</li><li>Dispatched</li>
        </ol>
      </section>
      <section className="login-form">
        <form onSubmit={submit}>
          <h2>Sign in</h2>
          <Field label="Email"><input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password"><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {error && <p className="form-error">{error}</p>}
          <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <div className="demo">
            <span>Demo accounts</span>
            <button type="button" className="btn ghost" onClick={() => fill('admin@erp.com', 'Admin@123')}>Admin</button>
            <button type="button" className="btn ghost" onClick={() => fill('sales@erp.com', 'Sales@123')}>Sales user</button>
          </div>
        </form>
      </section>
    </div>
  );
}
