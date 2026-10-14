const router = require('express').Router();
const SalesOrder = require('../models/SalesOrder');
const Inventory = require('../models/Inventory');
const Dispatch = require('../models/Dispatch');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { authenticate, authorize, scope } = require('../middleware/auth');
const { nextNumber } = require('../utils/counter');
const v = require('../validators');

router.use(authenticate);

const populate = (q) =>
  q.populate('customer').populate('quotation', 'number').populate('enquiry', 'number').populate('items.product', 'code name unit');

async function withDispatch(orders) {
  const ds = await Dispatch.find({ salesOrder: { $in: orders.map((o) => o._id) } }).lean();
  const m = new Map(ds.map((d) => [String(d.salesOrder), d]));
  return orders.map((o) => ({ ...o, dispatch: m.get(String(o._id)) || null }));
}

router.get('/', asyncHandler(async (req, res) => {
  const orders = await populate(SalesOrder.find(scope(req.user)).sort({ createdAt: -1 })).lean();
  res.json(await withDispatch(orders));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const o = await populate(SalesOrder.findOne({ _id: req.params.id, ...scope(req.user) })).lean();
  if (!o) throw new ApiError(404, 'Sales order not found');
  res.json((await withDispatch([o]))[0]);
}));

// ---- helpers: atomic stock operations ---------------------------------------------------------
// Every stock change is ONE conditional findOneAndUpdate on the inventory document. MongoDB applies
// single-document updates atomically, so the check "enough stock?" and the change "reserve it" cannot
// be separated by another request. (A+B racing for 80 and 50 of 100: only one condition can match.)
const availableExpr = (qty) => ({ $gte: [{ $subtract: [{ $subtract: ['$physical', '$reserved'] }, '$damaged'] }, qty] });

async function reserve(items) {
  const done = [];
  const sorted = [...items].sort((a, b) => String(a.product).localeCompare(String(b.product)));
  try {
    for (const it of sorted) {
      const inv = await Inventory.findOneAndUpdate(
        { product: it.product, $expr: availableExpr(it.quantity) },
        { $inc: { reserved: it.quantity } }
      );
      if (!inv) {
        const cur = await Inventory.findOne({ product: it.product }).populate('product', 'code');
        const avail = cur ? cur.physical - cur.reserved - cur.damaged : 0;
        throw new ApiError(409, `Insufficient stock for ${cur?.product?.code || 'product'}: required ${it.quantity}, available ${avail}`);
      }
      done.push(it);
    }
  } catch (err) {
    await release(done); // compensate partial reservations of a multi-line order
    throw err;
  }
}
const release = (items) =>
  Promise.all(items.map((it) => Inventory.updateOne({ product: it.product }, { $inc: { reserved: -it.quantity } })));

// ---- confirm & reserve (ADMIN) ---------------------------------------------------------------
router.post('/:id/confirm', authorize('ADMIN'), asyncHandler(async (req, res) => {
  // Claim the order first: only one request can move PENDING -> CONFIRMED (no double reservation).
  const order = await SalesOrder.findOneAndUpdate(
    { _id: req.params.id, status: 'PENDING' },
    { status: 'CONFIRMED', confirmedAt: new Date() },
    { new: true }
  );
  if (!order) {
    const ex = await SalesOrder.findById(req.params.id);
    if (!ex) throw new ApiError(404, 'Sales order not found');
    throw new ApiError(409, `Only PENDING orders can be confirmed (this one is ${ex.status})`);
  }
  try {
    await reserve(order.items);
  } catch (err) {
    await SalesOrder.updateOne({ _id: order._id }, { status: 'PENDING', $unset: { confirmedAt: 1 } });
    throw err;
  }
  res.json((await withDispatch([await populate(SalesOrder.findById(order._id)).lean()]))[0]);
}));

// ---- cancel (ADMIN) - releases reserved stock if the order was confirmed ----------------------
router.post('/:id/cancel', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const prev = await SalesOrder.findOneAndUpdate(
    { _id: req.params.id, status: { $in: ['PENDING', 'CONFIRMED'] } },
    { status: 'CANCELLED', cancelledAt: new Date() } // returns the document as it was BEFORE the update
  );
  if (!prev) {
    const ex = await SalesOrder.findById(req.params.id);
    if (!ex) throw new ApiError(404, 'Sales order not found');
    throw new ApiError(409, `A ${ex.status} order cannot be cancelled`);
  }
  if (prev.status === 'CONFIRMED') await release(prev.items);
  res.json((await withDispatch([await populate(SalesOrder.findById(prev._id)).lean()]))[0]);
}));

// ---- dispatch (ADMIN) ------------------------------------------------------------------------
router.post('/:id/dispatch', authorize('ADMIN'), validate(v.dispatch), asyncHandler(async (req, res) => {
  // Claim: only a CONFIRMED order can be dispatched, and only once (cancelled / pending / already dispatched fail here).
  const order = await SalesOrder.findOneAndUpdate({ _id: req.params.id, status: 'CONFIRMED' }, { status: 'DISPATCHED' }, { new: true });
  if (!order) {
    const ex = await SalesOrder.findById(req.params.id);
    if (!ex) throw new ApiError(404, 'Sales order not found');
    throw new ApiError(409, `Only CONFIRMED orders can be dispatched (this one is ${ex.status})`);
  }

  const done = [];
  const undo = async () => {
    await Promise.all(done.map((it) => Inventory.updateOne({ product: it.product }, { $inc: { physical: it.quantity, reserved: it.quantity } })));
    await SalesOrder.updateOne({ _id: order._id }, { status: 'CONFIRMED' });
  };
  try {
    for (const it of order.items) {
      // physical AND reserved both drop, but never below what is actually reserved / on hand
      const inv = await Inventory.findOneAndUpdate(
        { product: it.product, reserved: { $gte: it.quantity }, physical: { $gte: it.quantity } },
        { $inc: { physical: -it.quantity, reserved: -it.quantity } }
      );
      if (!inv) throw new ApiError(409, 'Cannot dispatch more than the reserved quantity');
      done.push(it);
    }
    const dispatch = await Dispatch.create({
      number: await nextNumber('DSP'),
      salesOrder: order._id,
      dispatchDate: req.body.dispatchDate || new Date(),
      items: order.items.map((i) => ({ product: i.product, quantity: i.quantity })),
      vehicleNumber: req.body.vehicleNumber,
      driverName: req.body.driverName,
      dispatchedBy: req.user._id,
    });
    const full = await populate(SalesOrder.findById(order._id)).lean();
    res.status(201).json({ ...full, dispatch });
  } catch (err) {
    await undo();
    throw err;
  }
}));

module.exports = router;
