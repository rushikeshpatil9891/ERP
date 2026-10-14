const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Base = qty x price; discount applied on base; GST applied on discounted amount.
function calcItem({ quantity, unitPrice, discountPct = 0, gstPct = 0 }) {
  const baseAmount = r2(quantity * unitPrice);
  const discountAmount = r2((baseAmount * discountPct) / 100);
  const taxable = baseAmount - discountAmount;
  const gstAmount = r2((taxable * gstPct) / 100);
  const lineAmount = r2(taxable + gstAmount);
  return { baseAmount, discountAmount, gstAmount, lineAmount };
}

function calcQuotation(lines) {
  const items = lines.map((l) => ({ ...l, ...calcItem(l) }));
  const grandTotal = r2(items.reduce((s, i) => s + i.lineAmount, 0));
  return { items, grandTotal };
}
module.exports = { calcItem, calcQuotation, r2 };
