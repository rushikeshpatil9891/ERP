import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api, date, isoDay, money, previewLine } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Empty, Field, Modal, Stat, useAsync, useToast } from '../ui.jsx';
import { useNavigate } from 'react-router-dom';

function NewQuotation({ enquiries, products, onClose, onSaved }) {
  const toast = useToast();
  const [enquiryId, setEnquiryId] = useState('');
  const [validUntil, setValidUntil] = useState(isoDay(15));
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);

  const pick = (id) => {
    setEnquiryId(id);
    const e = enquiries.find((x) => x._id === id);
    setLines(e ? e.items.map((i) => ({
      productId: i.product._id, label: `${i.product.code} · ${i.product.name}`, unit: i.product.unit,
      quantity: i.quantity, unitPrice: i.product.basePrice, discountPct: 0, gstPct: 18,
    })) : []);
  };
  const set = (i, k, v) => setLines((s) => s.map((l, x) => (x === i ? { ...l, [k]: v } : l)));
  const total = lines.reduce((s, l) => s + previewLine(l), 0);

  const submit = async () => {
    setBusy(true);
    try {
      // totals are NOT sent: the server calculates them
      const body = {
        enquiryId, validUntil,
        items: lines.map((l) => ({
          productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice),
          discountPct: Number(l.discountPct), gstPct: Number(l.gstPct),
        })),
      };
      const q = await api('/quotations', { method: 'POST', body });
      toast(`Quotation ${q.number} saved as draft`);
      onSaved();
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <Modal title="New quotation" onClose={onClose} wide footer={
      <>
        <span className="foot-total">Estimated total <b>{money(total)}</b></span>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={submit} disabled={busy || !enquiryId}>{busy ? 'Saving…' : 'Save as draft'}</button>
      </>
    }>
      <div className="grid2">
        <Field label="Enquiry">
          <select value={enquiryId} onChange={(e) => pick(e.target.value)}>
            <option value="">Select an open enquiry</option>
            {enquiries.map((e) => <option key={e._id} value={e._id}>{e.number} — {e.customer?.companyName}</option>)}
          </select>
        </Field>
        <Field label="Valid until"><input type="date" min={isoDay()} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
      </div>

      {lines.length > 0 && (
        <div className="q-lines">
          <div className="q-head"><span>Product</span><span>Qty</span><span>Unit price</span><span>Disc %</span><span>GST %</span><span className="num">Line total</span></div>
          {lines.map((l, i) => (
            <div className="q-row" key={l.productId}>
              <span className="q-name">{l.label}</span>
              <input type="number" min="1" value={l.quantity} onChange={(e) => set(i, 'quantity', e.target.value)} aria-label="Quantity" />
              <input type="number" min="0" step="0.01" value={l.unitPrice} onChange={(e) => set(i, 'unitPrice', e.target.value)} aria-label="Unit price" />
              <input type="number" min="0" max="100" value={l.discountPct} onChange={(e) => set(i, 'discountPct', e.target.value)} aria-label="Discount percent" />
              <input type="number" min="0" max="100" value={l.gstPct} onChange={(e) => set(i, 'gstPct', e.target.value)} aria-label="GST percent" />
              <span className="num">{money(previewLine(l))}</span>
            </div>
          ))}
          <p className="hint">Shown for convenience only. The server recalculates every amount when you save.</p>
        </div>
      )}
    </Modal>
  );
}

export default function Quotations() {
  const { isSales } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, reload } = useAsync(async () => {
    const [quotations, enquiries, products] = await Promise.all([api('/quotations'), api('/enquiries'), api('/products')]);
    return { quotations, enquiries, products };
  });
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');

  const rows = useMemo(() => (data?.quotations || []).filter((x) =>
    (status === 'ALL' || x.status === status) &&
    `${x.number} ${x.customer?.companyName}`.toLowerCase().includes(q.toLowerCase())), [data, q, status]);
  const count = (s) => (data?.quotations || []).filter((x) => x.status === s).length;
  const openEnquiries = (data?.enquiries || []).filter((e) => ['NEW', 'QUOTED'].includes(e.status));

  const act = async (fn, okMsg) => {
    try { await fn(); toast(okMsg); reload(); } catch (err) { toast(err.message, 'err'); }
  };
  const setSt = (x, s, msg) => act(() => api(`/quotations/${x._id}/status`, { method: 'PATCH', body: { status: s } }), msg);
  const convert = (x) => act(async () => { const o = await api(`/quotations/${x._id}/convert`, { method: 'POST' }); setTimeout(() => nav('/orders'), 700); return o; }, `Sales order created from ${x.number}`);

  return (
    <>
      <header className="page-head">
        <div><h1>Quotations</h1><p>Price the enquiry, send it, and turn accepted quotes into orders.</p></div>
        {isSales && <button className="btn primary" onClick={() => setOpen(true)}><Plus size={16} /> New quotation</button>}
      </header>

      <div className="stats">
        <Stat label="Draft" value={count('DRAFT')} />
        <Stat label="Sent" value={count('SENT')} tone="blue" />
        <Stat label="Accepted" value={count('ACCEPTED')} tone="green" />
        <Stat label="Rejected" value={count('REJECTED')} tone="red" />
      </div>

      <div className="toolbar">
        <div className="search"><Search size={16} /><input placeholder="Search by number or company" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          {['ALL', 'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="panel table-wrap">
        {loading ? <div className="loading">Loading quotations…</div> : rows.length === 0 ? (
          <Empty title="No quotations yet" hint={isSales ? 'Open an enquiry and price it with “New quotation”.' : undefined} />
        ) : (
          <table>
            <thead><tr><th>Quotation</th><th>Customer</th><th className="num">Total</th><th>Valid until</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x._id}>
                  <td><b>{x.number}</b><small>{x.enquiry?.number}</small></td>
                  <td>{x.customer?.companyName}</td>
                  <td className="num">{money(x.grandTotal)}</td>
                  <td>{date(x.validUntil)}</td>
                  <td><Badge status={x.status} />{x.orderNumber && <small>→ {x.orderNumber}</small>}</td>
                  <td className="actions">
                    <button className="btn ghost small" onClick={() => setView(x)}>View</button>
                    {isSales && x.status === 'DRAFT' && <button className="btn small" onClick={() => setSt(x, 'SENT', `${x.number} marked as sent`)}>Send</button>}
                    {isSales && x.status === 'SENT' && <>
                      <button className="btn small success" onClick={() => setSt(x, 'ACCEPTED', `${x.number} accepted`)}>Accept</button>
                      <button className="btn small ghost danger" onClick={() => setSt(x, 'REJECTED', `${x.number} rejected`)}>Reject</button>
                    </>}
                    {isSales && x.status === 'ACCEPTED' && !x.converted && <button className="btn small primary" onClick={() => convert(x)}>Create order</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && <NewQuotation enquiries={openEnquiries} products={data.products} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />}

      {view && (
        <Modal title={view.number} onClose={() => setView(null)} wide>
          <div className="kv">
            <div><span>Customer</span><b>{view.customer?.companyName}</b></div>
            <div><span>Enquiry</span><b>{view.enquiry?.number}</b></div>
            <div><span>Valid until</span><b>{date(view.validUntil)}</b></div>
            <div><span>Status</span><Badge status={view.status} /></div>
          </div>
          <table className="mini">
            <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Disc</th><th className="num">GST</th><th className="num">Amount</th></tr></thead>
            <tbody>{view.items.map((i) => (
              <tr key={i.product._id}>
                <td>{i.product.code} · {i.product.name}</td><td className="num">{i.quantity}</td><td className="num">{money(i.unitPrice)}</td>
                <td className="num">{i.discountPct}%</td><td className="num">{i.gstPct}%</td><td className="num">{money(i.lineAmount)}</td>
              </tr>))}
            </tbody>
            <tfoot><tr><td colSpan="5">Grand total</td><td className="num">{money(view.grandTotal)}</td></tr></tfoot>
          </table>
        </Modal>
      )}
    </>
  );
}
