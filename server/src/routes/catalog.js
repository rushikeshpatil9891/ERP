// Products, inventory and customers
const router = require('express').Router();
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Customer = require('../models/Customer');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { authenticate, authorize, scope } = require('../middleware/auth');
const v = require('../validators');

router.use(authenticate);

router.get('/products', asyncHandler(async (_req, res) => {
  res.json(await Product.find().sort({ code: 1 }));
}));

router.post('/products', authorize('ADMIN'), validate(v.product), asyncHandler(async (req, res) => {
  const { openingStock, ...data } = req.body;
  const product = await Product.create(data);
  await Inventory.create({ product: product._id, physical: openingStock });
  res.status(201).json(product);
}));

router.get('/inventory', asyncHandler(async (_req, res) => {
  const rows = await Inventory.find().populate('product');
  res.json(
    rows
      .filter((r) => r.product)
      .map((r) => ({
        product: r.product, physical: r.physical, reserved: r.reserved, damaged: r.damaged,
        available: r.physical - r.reserved - r.damaged,
      }))
      .sort((a, b) => a.product.code.localeCompare(b.product.code))
  );
}));

// Admin stock correction. Rejected unless physical >= reserved + damaged (checked atomically in the query).
router.put('/inventory/:productId', authorize('ADMIN'), validate(v.inventory), asyncHandler(async (req, res) => {
  const { physical, damaged } = req.body;
  const inv = await Inventory.findOneAndUpdate(
    { product: req.params.productId, $expr: { $lte: [{ $add: ['$reserved', damaged] }, physical] } },
    { physical, damaged },
    { new: true }
  );
  if (!inv) {
    const exists = await Inventory.findOne({ product: req.params.productId });
    if (!exists) throw new ApiError(404, 'Inventory record not found');
    throw new ApiError(409, `Physical stock cannot be lower than reserved (${exists.reserved}) + damaged (${damaged})`);
  }
  res.json(inv);
}));

router.get('/customers', asyncHandler(async (req, res) => {
  res.json(await Customer.find(scope(req.user)).sort({ companyName: 1 }));
}));

router.post('/customers', authorize('SALES'), validate(v.customer), asyncHandler(async (req, res) => {
  res.status(201).json(await Customer.create({ ...req.body, createdBy: req.user._id }));
}));

module.exports = router;
