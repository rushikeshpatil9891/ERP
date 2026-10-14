import { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { api, date, isoDay } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Empty, Field, Modal, Stat, useAsync, useToast } from '../ui.jsx';

const blankCustomer = { companyName: '', contactPerson: '', mobile: '', email: '', city: '' };

function NewEnquiry({ products, customers, onClose, onSaved }) {
  const toast = useToast();
  const [mode, setMode] = useState(customers.length ? 'existing' : 'new');
  const [customerId, setCustomerId] = useState('');
  const [customer, setCustomer] = useState(blankCustomer);
  const [requiredDate, setRequiredDate] = useState(isoDay(14));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ productId: '', quantity: 1 }]);
  const [busy, setBusy] = useState(false);

  const setItem = (i, patch) => setItems((s) => s.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const setC = (k) => (e) => setCustomer((c) => ({ ...c, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    try {
      const body = {
        requiredDate, notes,
        items: items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity) })),
        ...(mode === 'new' ? { customer } : { customerId }),
      };
      const e = await api('/enquiries', { method: 'POST', body });
      toast(`Enquiry ${e.number} created`);
      onSaved();
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <Modal title="New enquiry" onClose={onClose} wide footer={
      <>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Create enquiry'}</button>
      </>
    }>
      <div className="seg" role="tablist">
        <button className={mode === 'existing' ? 'on' : ''} onClick={() => setMode('existing')} disabled={!customers.length}>Existing customer</button>
        <button className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>New customer</button>
      </div>

      {mode === 'existing' ? (
        <Field label="Customer">
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Select a customer</option>
            {customers.map((c) => <option key={c._id} value={c._id}>{c.companyName} — {c.city}</option>)}
          </select>
        </Field>
      ) : (
        <div className="grid2">
          <Field label="Company name"><input value={customer.companyName} onChange={setC('companyName')} /></Field>
          <Field label="Contact person"><input value={customer.contactPerson} onChange={setC('contactPerson')} /></Field>
          <Field label="Mobile"><input value={customer.mobile} onChange={setC('mobile')} inputMode="tel" /></Field>
          <Field label="Email"><input type="email" value={customer.email} onChange={setC('email')} /></Field>
          <Field label="City"><input value={customer.city} onChange={setC('city')} /></Field>
        </div>
      )}

      <div className="grid2">
        <Field label="Required by"><input type="date" min={isoDay()} value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} /></Field>
        <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery site, packing, special terms" /></Field>
      </div>

      <h4 className="sub">Products</h4>
      {items.map((it, i) => (
        <div className="line-row" key={i}>
          <select value={it.productId} onChange={(e) => setItem(i, { productId: e.target.value })} aria-label="Product">
            <option value="">Select a product</option>
            {products.map((p) => (
              <option key={p._id} value={p._id} disabled={items.some((x, xi) => xi !== i && x.productId === p._id)}>{p.code} · {p.name}</option>
            ))}
          </select>
          <input type="number" min="1" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} aria-label="Quantity" />
          <button className="icon-btn" onClick={() => setItems((s) => s.filter((_, x) => x !== i))} disabled={items.length === 1} aria-label="Remove line"><X size={16} /></button>
        </div>
      ))}
      <button className="btn ghost small" onClick={() => setItems((s) => [...s, { productId: '', quantity: 1 }])}><Plus size={14} /> Add product</button>
    </Modal>
  );
}

export default function Enquiries() {
  const { isSales } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useAsync(async () => {
    const [enquiries, products, customers] = await Promise.all([api('/enquiries'), api('/products'), api('/customers')]);
    return { enquiries, products, customers };
  });
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');

  const rows = useMemo(() => (data?.enquiries || []).filter((e) =>
    (status === 'ALL' || e.status === status) &&
    (`${e.number} ${e.customer?.companyName}`.toLowerCase().includes(q.toLowerCase()))), [data, q, status]);
  const count = (s) => (data?.enquiries || []).filter((e) => e.status === s).length;

  const markLost = async (e) => {
    try { await api(`/enquiries/${e._id}/status`, { method: 'PATCH', body: { status: 'LOST' } }); toast(`${e.number} marked as lost`); reload(); }
    catch (err) { toast(err.message, 'err'); }
  };

  return (
    <>
      <header className="page-head">
        <div><h1>Enquiries</h1><p>Requests from customers waiting for a price.</p></div>
        {isSales && <button className="btn primary" onClick={() => setOpen(true)}><Plus size={16} /> New enquiry</button>}
      </header>

      <div className="stats">
        <Stat label="New" value={count('NEW')} tone="blue" />
        <Stat label="Quoted" value={count('QUOTED')} tone="amber" />
        <Stat label="Won" value={count('WON')} tone="green" />
        <Stat label="Lost" value={count('LOST')} tone="red" />
      </div>

      <div className="toolbar">
        <div className="search"><Search size={16} /><input placeholder="Search by number or company" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          {['ALL', 'NEW', 'QUOTED', 'WON', 'LOST'].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="panel table-wrap">
        {loading ? <div className="loading">Loading enquiries…</div> : rows.length === 0 ? (
          <Empty title="No enquiries found" hint={isSales ? 'Create the first one with “New enquiry”.' : 'Sales users create enquiries.'} />
        ) : (
          <table>
            <thead><tr><th>Enquiry</th><th>Customer</th><th>Items</th><th>Required by</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e._id}>
                  <td><b>{e.number}</b><small>{date(e.enquiryDate)}</small></td>
                  <td>{e.customer?.companyName}<small>{e.customer?.contactPerson} · {e.customer?.city}</small></td>
                  <td>{e.items.length} product{e.items.length > 1 ? 's' : ''}</td>
                  <td>{date(e.requiredDate)}</td>
                  <td><Badge status={e.status} /></td>
                  <td className="actions">
                    <button className="btn ghost small" onClick={() => setView(e)}>View</button>
                    {isSales && ['NEW', 'QUOTED'].includes(e.status) && <button className="btn ghost small danger" onClick={() => markLost(e)}>Mark lost</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && <NewEnquiry products={data.products} customers={data.customers} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />}

      {view && (
        <Modal title={view.number} onClose={() => setView(null)}>
          <div className="kv">
            <div><span>Customer</span><b>{view.customer?.companyName}</b></div>
            <div><span>Contact</span><b>{view.customer?.contactPerson} · {view.customer?.mobile}</b></div>
            <div><span>Email</span><b>{view.customer?.email}</b></div>
            <div><span>Status</span><Badge status={view.status} /></div>
          </div>
          <table className="mini">
            <thead><tr><th>Product</th><th className="num">Quantity</th></tr></thead>
            <tbody>{view.items.map((i) => <tr key={i.product._id}><td>{i.product.code} · {i.product.name}</td><td className="num">{i.quantity} {i.product.unit}</td></tr>)}</tbody>
          </table>
          {view.notes && <p className="note">{view.notes}</p>}
        </Modal>
      )}
    </>
  );
}
