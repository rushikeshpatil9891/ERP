import { useMemo, useState } from 'react';
import { Ban, Check, Pencil, Plus, Truck } from 'lucide-react';
import { api, date, money } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Empty, Field, Modal, Stat, useAsync, useToast } from '../ui.jsx';

const STEPS = ['PENDING', 'CONFIRMED', 'DISPATCHED'];

function Flow({ status }) {
  if (status === 'CANCELLED') return <div className="flow-bar cancelled">Cancelled</div>;
  const at = STEPS.indexOf(status);
  return (
    <ol className="flow-bar" aria-label={`Order progress: ${status}`}>
      {STEPS.map((s, i) => <li key={s} className={i < at ? 'done' : i === at ? 'now' : ''}>{s === 'PENDING' ? 'Pending' : s === 'CONFIRMED' ? 'Stock reserved' : 'Dispatched'}</li>)}
    </ol>
  );
}

function DispatchModal({ order, onClose, onDone }) {
  const toast = useToast();
  const [vehicleNumber, setVehicle] = useState('');
  const [driverName, setDriver] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const o = await api(`/sales-orders/${order._id}/dispatch`, { method: 'POST', body: { vehicleNumber, driverName } });
      toast(`${o.dispatch.number} dispatched`);
      onDone();
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Dispatch ${order.number}`} onClose={onClose} footer={
      <><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={go} disabled={busy}>{busy ? 'Dispatching…' : 'Dispatch stock'}</button></>
    }>
      <p className="note">Dispatching removes the reserved quantity from both physical and reserved stock.</p>
      <table className="mini">
        <tbody>{order.items.map((i) => <tr key={i.product._id}><td>{i.product.code} · {i.product.name}</td><td className="num">{i.quantity} {i.product.unit}</td></tr>)}</tbody>
      </table>
      <div className="grid2">
        <Field label="Vehicle number"><input value={vehicleNumber} onChange={(e) => setVehicle(e.target.value)} placeholder="MH12 AB 1234" /></Field>
        <Field label="Driver name"><input value={driverName} onChange={(e) => setDriver(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function StockModal({ row, onClose, onDone }) {
  const toast = useToast();
  const [physical, setPhysical] = useState(row.physical);
  const [damaged, setDamaged] = useState(row.damaged);
  const save = async () => {
    try {
      await api(`/inventory/${row.product._id}`, { method: 'PUT', body: { physical: Number(physical), damaged: Number(damaged) } });
      toast(`${row.product.code} stock updated`);
      onDone();
    } catch (err) { toast(err.message, 'err'); }
  };
  const avail = Number(physical) - row.reserved - Number(damaged);
  return (
    <Modal title={`Adjust ${row.product.code}`} onClose={onClose} footer={
      <><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save stock</button></>
    }>
      <div className="grid2">
        <Field label="Physical quantity"><input type="number" min="0" value={physical} onChange={(e) => setPhysical(e.target.value)} /></Field>
        <Field label="Damaged quantity"><input type="number" min="0" value={damaged} onChange={(e) => setDamaged(e.target.value)} /></Field>
      </div>
      <p className="note">Reserved: <b>{row.reserved}</b> (managed by orders). Available after saving: <b className={avail < 0 ? 'neg' : ''}>{avail}</b></p>
    </Modal>
  );
}

function NewProduct({ onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ code: '', name: '', category: '', unit: 'Nos', basePrice: '', openingStock: 0 });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    try { await api('/products', { method: 'POST', body: { ...f, basePrice: Number(f.basePrice), openingStock: Number(f.openingStock) } }); toast('Product added'); onDone(); }
    catch (err) { toast(err.message, 'err'); }
  };
  return (
    <Modal title="Add product" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Add product</button></>}>
      <div className="grid2">
        <Field label="Product code"><input value={f.code} onChange={set('code')} /></Field>
        <Field label="Product name"><input value={f.name} onChange={set('name')} /></Field>
        <Field label="Category"><input value={f.category} onChange={set('category')} /></Field>
        <Field label="Unit"><input value={f.unit} onChange={set('unit')} /></Field>
        <Field label="Base price"><input type="number" min="0" step="0.01" value={f.basePrice} onChange={set('basePrice')} /></Field>
        <Field label="Opening stock"><input type="number" min="0" value={f.openingStock} onChange={set('openingStock')} /></Field>
      </div>
    </Modal>
  );
}

export default function SalesOrders() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useAsync(async () => {
    const [orders, inventory] = await Promise.all([api('/sales-orders'), api('/inventory')]);
    return { orders, inventory };
  });
  const [tab, setTab] = useState('orders');
  const [status, setStatus] = useState('ALL');
  const [dispatching, setDispatching] = useState(null);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const stockOf = useMemo(() => new Map((data?.inventory || []).map((r) => [r.product._id, r])), [data]);
  const orders = (data?.orders || []).filter((o) => status === 'ALL' || o.status === status);
  const count = (s) => (data?.orders || []).filter((o) => o.status === s).length;

  const run = async (o, path, msg) => {
    setBusyId(o._id);
    try { await api(`/sales-orders/${o._id}/${path}`, { method: 'POST' }); toast(msg); } catch (err) { toast(err.message, 'err'); }
    setBusyId(null); reload();
  };

  return (
    <>
      <header className="page-head">
        <div><h1>Sales orders</h1><p>Confirm to reserve stock, then dispatch when the truck is ready.</p></div>
        <div className="seg">
          <button className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}>Orders</button>
          <button className={tab === 'stock' ? 'on' : ''} onClick={() => setTab('stock')}>Inventory</button>
        </div>
      </header>

      {tab === 'orders' && (
        <>
          <div className="stats">
            <Stat label="Pending" value={count('PENDING')} tone="amber" />
            <Stat label="Stock reserved" value={count('CONFIRMED')} tone="blue" />
            <Stat label="Dispatched" value={count('DISPATCHED')} tone="green" />
            <Stat label="Cancelled" value={count('CANCELLED')} tone="red" />
          </div>
          <div className="toolbar">
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              {['ALL', 'PENDING', 'CONFIRMED', 'DISPATCHED', 'CANCELLED'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>

          {loading ? <div className="panel loading">Loading orders…</div> : orders.length === 0 ? (
            <div className="panel"><Empty title="No sales orders" hint="Accepted quotations are converted into orders from the Quotations screen." /></div>
          ) : (
            <div className="orders">
              {orders.map((o) => (
                <article className="panel order" key={o._id}>
                  <header>
                    <div>
                      <h3>{o.number} <Badge status={o.status} /></h3>
                      <p>{o.customer?.companyName} · {o.quotation?.number} · {date(o.orderDate)}</p>
                    </div>
                    <div className="order-total">{money(o.totalAmount)}</div>
                  </header>
                  <Flow status={o.status} />
                  <table className="mini">
                    <thead><tr><th>Product</th><th className="num">Ordered</th><th className="num">Available now</th><th /></tr></thead>
                    <tbody>
                      {o.items.map((i) => {
                        const s = stockOf.get(i.product._id);
                        const avail = s ? s.available : 0;
                        const open = o.status === 'PENDING';
                        const ok = avail >= i.quantity;
                        return (
                          <tr key={i.product._id}>
                            <td>{i.product.code} · {i.product.name}</td>
                            <td className="num">{i.quantity} {i.product.unit}</td>
                            <td className="num">{open ? avail : '—'}</td>
                            <td className="num">{open && <span className={`chip ${ok ? 'good' : 'bad'}`}>{ok ? 'In stock' : `Short by ${i.quantity - avail}`}</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {o.dispatch && (
                    <p className="dispatch-info"><Truck size={16} /> {o.dispatch.number} · {o.dispatch.vehicleNumber} · driver {o.dispatch.driverName} · {date(o.dispatch.dispatchDate)}</p>
                  )}
                  {isAdmin && ['PENDING', 'CONFIRMED'].includes(o.status) && (
                    <footer>
                      {o.status === 'PENDING' && <button className="btn primary" disabled={busyId === o._id} onClick={() => run(o, 'confirm', `${o.number} confirmed, stock reserved`)}><Check size={16} /> Confirm &amp; reserve stock</button>}
                      {o.status === 'CONFIRMED' && <button className="btn primary" onClick={() => setDispatching(o)}><Truck size={16} /> Dispatch</button>}
                      <button className="btn ghost danger" disabled={busyId === o._id} onClick={() => window.confirm(`Cancel ${o.number}?${o.status === 'CONFIRMED' ? ' Reserved stock will be released.' : ''}`) && run(o, 'cancel', `${o.number} cancelled`)}><Ban size={16} /> Cancel order</button>
                    </footer>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'stock' && (
        <>
          <div className="toolbar">
            <span className="muted">Available = physical − reserved − damaged</span>
            {isAdmin && <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} /> Add product</button>}
          </div>
          <div className="panel table-wrap">
            {loading ? <div className="loading">Loading inventory…</div> : (
              <table>
                <thead><tr><th>Product</th><th>Category</th><th className="num">Physical</th><th className="num">Reserved</th><th className="num">Damaged</th><th className="num">Available</th><th>Level</th>{isAdmin && <th />}</tr></thead>
                <tbody>
                  {data.inventory.map((r) => {
                    const pct = r.physical ? Math.max(0, Math.round((r.available / r.physical) * 100)) : 0;
                    return (
                      <tr key={r.product._id}>
                        <td><b>{r.product.code}</b><small>{r.product.name}</small></td>
                        <td>{r.product.category}</td>
                        <td className="num">{r.physical}</td>
                        <td className="num">{r.reserved}</td>
                        <td className="num">{r.damaged}</td>
                        <td className="num"><b>{r.available}</b> <small className="inline">{r.product.unit}</small></td>
                        <td><div className="bar" title={`${pct}% available`}><i style={{ width: `${pct}%` }} className={pct < 20 ? 'low' : ''} /></div></td>
                        {isAdmin && <td className="actions"><button className="btn ghost small" onClick={() => setEditing(r)}><Pencil size={14} /> Adjust</button></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {dispatching && <DispatchModal order={dispatching} onClose={() => setDispatching(null)} onDone={() => { setDispatching(null); reload(); }} />}
      {editing && <StockModal row={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
      {adding && <NewProduct onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </>
  );
}
