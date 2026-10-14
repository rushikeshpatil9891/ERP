// Resets the database and loads demo data:  npm run seed
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('./config/env');
const User = require('./models/User');
const Product = require('./models/Product');
const Inventory = require('./models/Inventory');
const Customer = require('./models/Customer');
const Counter = require('./models/Counter');
const Enquiry = require('./models/Enquiry');
const Quotation = require('./models/Quotation');
const SalesOrder = require('./models/SalesOrder');
const Dispatch = require('./models/Dispatch');

const products = [
  { code: 'BRG-6205', name: 'Deep Groove Ball Bearing 6205', category: 'Bearings', unit: 'Nos', basePrice: 185, stock: 500 },
  { code: 'VLV-BF50', name: 'Butterfly Valve DN50', category: 'Valves', unit: 'Nos', basePrice: 2450, stock: 120 },
  { code: 'MTR-3PH5', name: '3-Phase Induction Motor 5 HP', category: 'Motors', unit: 'Nos', basePrice: 18900, stock: 40 },
  { code: 'GBX-WM60', name: 'Worm Gearbox 60:1', category: 'Gearboxes', unit: 'Nos', basePrice: 9650, stock: 35 },
  { code: 'HYD-PMP2', name: 'Hydraulic Gear Pump 2 LPM', category: 'Hydraulics', unit: 'Nos', basePrice: 7300, stock: 60 },
  { code: 'STL-ER16', name: 'MS Round Bar 16mm (6m)', category: 'Raw Material', unit: 'Kg', basePrice: 72, stock: 5000 },
  { code: 'CBL-FR25', name: 'FR Copper Cable 2.5 sq mm (90m)', category: 'Electrical', unit: 'Coil', basePrice: 3150, stock: 85 },
  { code: 'FLT-AIR1', name: 'Industrial Air Filter Element', category: 'Filtration', unit: 'Nos', basePrice: 1280, stock: 150 },
];

(async () => {
  await mongoose.connect(env.mongoUri);
  await Promise.all([User, Product, Inventory, Customer, Counter, Enquiry, Quotation, SalesOrder, Dispatch].map((m) => m.deleteMany({})));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));

  await User.create([
    { name: 'Admin User', email: 'admin@erp.com', role: 'ADMIN', passwordHash: await bcrypt.hash('Admin@123', 10) },
    { name: 'Sales User', email: 'sales@erp.com', role: 'SALES', passwordHash: await bcrypt.hash('Sales@123', 10) },
  ]);
  for (const { stock, ...p } of products) {
    const doc = await Product.create(p);
    await Inventory.create({ product: doc._id, physical: stock });
  }
  console.log('Seeded: 2 users, %d products with inventory.\n  admin@erp.com / Admin@123\n  sales@erp.com / Sales@123', products.length);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
