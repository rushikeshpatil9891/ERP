const BASE = import.meta.env.VITE_API_URL || '/api';

export async function api(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('auth:logout'));
  if (!res.ok) {
    const detail = data.details?.map((d) => d.message).join(' · ');
    throw Object.assign(new Error(detail ? `${data.message}: ${detail}` : data.message || 'Request failed'), { status: res.status });
  }
  return data;
}

export const money = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const date = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const isoDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10);

// Same formula as the backend, used ONLY for the live preview in the form. The server recalculates.
export function previewLine({ quantity, unitPrice, discountPct, gstPct }) {
  const base = (Number(quantity) || 0) * (Number(unitPrice) || 0);
  const taxable = base - (base * (Number(discountPct) || 0)) / 100;
  return taxable + (taxable * (Number(gstPct) || 0)) / 100;
}
