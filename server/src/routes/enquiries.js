const router = require('express').Router();
const Enquiry = require('../models/Enquiry');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { authenticate, authorize, scope } = require('../middleware/auth');
const { nextNumber } = require('../utils/counter');
const v = require('../validators');

router.use(authenticate);
const populate = (q) => q.populate('customer').populate('items.product', 'code name unit basePrice');

router.get('/', asyncHandler(async (req, res) => {
  res.json(await populate(Enquiry.find(scope(req.user)).sort({ createdAt: -1 })));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const e = await populate(Enquiry.findOne({ _id: req.params.id, ...scope(req.user) }));
  if (!e) throw new ApiError(404, 'Enquiry not found');
  res.json(e);
}));

router.post('/', authorize('SALES'), validate(v.enquiry), asyncHandler(async (req, res) => {
  const { customerId, customer, requiredDate, notes, items } = req.body;

  const found = await Product.countDocuments({ _id: { $in: items.map((i) => i.productId) } });
  if (found !== items.length) throw new ApiError(400, 'One or more products do not exist');

  let customerDoc;
  if (customerId) {
    customerDoc = await Customer.findOne({ _id: customerId, ...scope(req.user) });
    if (!customerDoc) throw new ApiError(404, 'Customer not found');
  } else {
    customerDoc = await Customer.create({ ...customer, createdBy: req.user._id });
  }

  const enquiry = await Enquiry.create({
    number: await nextNumber('ENQ'),
    customer: customerDoc._id,
    requiredDate,
    notes,
    items: items.map((i) => ({ product: i.productId, quantity: i.quantity })),
    createdBy: req.user._id,
  });
  res.status(201).json(await populate(Enquiry.findById(enquiry._id)));
}));

// Manual close of an enquiry that will not convert. QUOTED/WON follow the quotation lifecycle automatically.
router.patch('/:id/status', authorize('SALES'), validate(v.enquiryStatus), asyncHandler(async (req, res) => {
  const e = await Enquiry.findOneAndUpdate(
    { _id: req.params.id, status: { $in: ['NEW', 'QUOTED'] }, ...scope(req.user) },
    { status: 'LOST' },
    { new: true }
  );
  if (!e) throw new ApiError(409, 'Only NEW or QUOTED enquiries can be marked as lost');
  res.json(await populate(Enquiry.findById(e._id)));
}));

module.exports = router;
