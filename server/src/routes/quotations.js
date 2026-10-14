const router = require('express').Router();
const Quotation = require('../models/Quotation');
const Enquiry = require('../models/Enquiry');
const Product = require('../models/Product');
const SalesOrder = require('../models/SalesOrder');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { authenticate, authorize, scope } = require('../middleware/auth');
const { nextNumber } = require('../utils/counter');
const { calcQuotation } = require('../utils/calc');
const v = require('../validators');

router.use(authenticate);
const populate = (q) =>
  q.populate('customer').populate('enquiry', 'number status').populate('items.product', 'code name unit');
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

router.get('/', asyncHandler(async (req, res) => {
  const list = await populate(Quotation.find(scope(req.user)).sort({ createdAt: -1 })).lean();
  const orders = await SalesOrder.find({ quotation: { $in: list.map((q) => q._id) } }, 'number quotation').lean();
  const byQ = new Map(orders.map((o) => [String(o.quotation), o.number]));
  res.json(list.map((q) => ({ ...q, orderNumber: byQ.get(String(q._id)) || null })));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const q = await populate(Quotation.findOne({ _id: req.params.id, ...scope(req.user) }));
  if (!q) throw new ApiError(404, 'Quotation not found');
  res.json(q);
}));

// The backend ALWAYS recalculates amounts. Any totals sent by the client are stripped by validation.
router.post('/', authorize('SALES'), validate(v.quotation), asyncHandler(async (req, res) => {
  const { enquiryId, validUntil } = req.body;
  if (validUntil < startOfToday()) throw new ApiError(400, 'Valid-until date cannot be in the past');

  const enquiry = await Enquiry.findOne({ _id: enquiryId, ...scope(req.user) });
  if (!enquiry) throw new ApiError(404, 'Enquiry not found');
  if (['WON', 'LOST'].includes(enquiry.status)) throw new ApiError(409, `Enquiry is already ${enquiry.status}`);

  const inputs = req.body.items || enquiry.items.map((i) => ({ productId: String(i.product), quantity: i.quantity, discountPct: 0, gstPct: 18 }));
  const products = await Product.find({ _id: { $in: inputs.map((i) => i.productId) } });
  const byId = new Map(products.map((p) => [String(p._id), p]));
  if (byId.size !== inputs.length) throw new ApiError(400, 'One or more products do not exist');

  const { items, grandTotal } = calcQuotation(
    inputs.map((i) => ({
      product: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice ?? byId.get(String(i.productId)).basePrice,
      discountPct: i.discountPct,
      gstPct: i.gstPct,
    }))
  );

  const q = await Quotation.create({
    number: await nextNumber('QT'),
    enquiry: enquiry._id,
    customer: enquiry.customer,
    items, grandTotal, validUntil,
    createdBy: req.user._id,
  });
  await Enquiry.updateOne({ _id: enquiry._id, status: 'NEW' }, { status: 'QUOTED' });
  res.status(201).json(await populate(Quotation.findById(q._id)));
}));

// DRAFT -> SENT -> ACCEPTED / REJECTED. Transition is atomic (conditional update on the previous status).
const FROM = { SENT: ['DRAFT'], ACCEPTED: ['SENT'], REJECTED: ['SENT'] };
router.patch('/:id/status', authorize('SALES'), validate(v.quotationStatus), asyncHandler(async (req, res) => {
  const { status } = req.body;
  const existing = await Quotation.findOne({ _id: req.params.id, ...scope(req.user) });
  if (!existing) throw new ApiError(404, 'Quotation not found');
  if (status === 'ACCEPTED' && existing.validUntil < startOfToday()) throw new ApiError(400, 'This quotation has expired and cannot be accepted');

  const q = await Quotation.findOneAndUpdate({ _id: existing._id, status: { $in: FROM[status] } }, { status }, { new: true });
  if (!q) throw new ApiError(409, `Cannot move a ${existing.status} quotation to ${status}`);

  if (status === 'ACCEPTED') await Enquiry.updateOne({ _id: q.enquiry }, { status: 'WON' });
  if (status === 'REJECTED') await Enquiry.updateOne({ _id: q.enquiry, status: 'QUOTED' }, { status: 'LOST' });
  res.json(await populate(Quotation.findById(q._id)));
}));

// ACCEPTED -> Sales Order. The `converted` flag is flipped atomically so two simultaneous requests
// cannot both pass; SalesOrder.quotation is also unique as a second safety net.
router.post('/:id/convert', authorize('SALES'), asyncHandler(async (req, res) => {
  const base = { _id: req.params.id, ...scope(req.user) };
  const q = await Quotation.findOneAndUpdate({ ...base, status: 'ACCEPTED', converted: false }, { converted: true }, { new: true });
  if (!q) {
    const ex = await Quotation.findOne(base);
    if (!ex) throw new ApiError(404, 'Quotation not found');
    if (ex.status !== 'ACCEPTED') throw new ApiError(409, `Only ACCEPTED quotations can be converted (this one is ${ex.status})`);
    throw new ApiError(409, 'This quotation has already been converted to a Sales Order');
  }
  try {
    const order = await SalesOrder.create({
      number: await nextNumber('SO'),
      customer: q.customer,
      enquiry: q.enquiry,
      quotation: q._id,
      items: q.items.map((i) => ({ product: i.product, quantity: i.quantity, amount: i.lineAmount })),
      totalAmount: q.grandTotal,
      createdBy: q.createdBy,
    });
    res.status(201).json(order);
  } catch (err) {
    await Quotation.updateOne({ _id: q._id }, { converted: false });
    throw err;
  }
}));

module.exports = router;
