process.env.JWT_SECRET = 'test-secret';
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod, app, adminToken, salesToken, Inventory, Product, SalesOrder, Quotation;
const future = () => new Date(Date.now() + 7 * 864e5).toISOString();
const auth = (t) => ({ Authorization: `Bearer ${t}` });
let seq = 0;

async function newProduct(physical, reserved = 0, price = 100) {
  const p = await Product.create({ code: `T-${++seq}`, name: `Test ${seq}`, category: 'Test', unit: 'Nos', basePrice: price });
  await Inventory.create({ product: p._id, physical, reserved });
  return p;
}

// Enquiry -> Quotation (SENT) via the real API
async function makeQuotation(productId, quantity, extra = {}) {
  const enq = await request(app).post('/api/enquiries').set(auth(salesToken)).send({
    customer: { companyName: 'ABC Engineering Pvt. Ltd.', contactPerson: 'Ravi', mobile: '9876543210', email: 'ravi@abc.com', city: 'Pune' },
    requiredDate: future(), items: [{ productId: String(productId), quantity }],
  });
  expect(enq.status).toBe(201);
  const q = await request(app).post('/api/quotations').set(auth(salesToken)).send({ enquiryId: enq.body._id, validUntil: future(), ...extra });
  expect(q.status).toBe(201);
  return q.body;
}
const setStatus = (id, status) => request(app).patch(`/api/quotations/${id}/status`).set(auth(salesToken)).send({ status });
const convert = (id) => request(app).post(`/api/quotations/${id}/convert`).set(auth(salesToken));

async function makeOrder(productId, quantity) {
  const q = await makeQuotation(productId, quantity);
  await setStatus(q._id, 'SENT');
  await setStatus(q._id, 'ACCEPTED');
  const res = await convert(q._id);
  expect(res.status).toBe(201);
  return res.body;
}
const confirm = (id) => request(app).post(`/api/sales-orders/${id}/confirm`).set(auth(adminToken));
const stock = async (p) => { const i = await Inventory.findOne({ product: p._id }); return { physical: i.physical, reserved: i.reserved, available: i.available }; };

beforeAll(async () => {
  let uri = process.env.MONGO_URI_TEST;
  if (!uri) { mongod = await MongoMemoryServer.create(); uri = mongod.getUri(); }
  await mongoose.connect(uri);
  app = require('../src/app');
  const User = require('../src/models/User');
  Inventory = require('../src/models/Inventory'); Product = require('../src/models/Product');
  SalesOrder = require('../src/models/SalesOrder'); Quotation = require('../src/models/Quotation');
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const hash = await bcrypt.hash('Passw0rd!', 4);
  await User.create([
    { name: 'A', email: 'a@t.com', role: 'ADMIN', passwordHash: hash },
    { name: 'S', email: 's@t.com', role: 'SALES', passwordHash: hash },
  ]);
  adminToken = (await request(app).post('/api/auth/login').send({ email: 'a@t.com', password: 'Passw0rd!' })).body.token;
  salesToken = (await request(app).post('/api/auth/login').send({ email: 's@t.com', password: 'Passw0rd!' })).body.token;
});
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });

describe('1. Quotation calculation (done by the backend)', () => {
  test('calculates line amounts and grand total; ignores client-sent totals', async () => {
    const p1 = await newProduct(1000), p2 = await newProduct(1000);
    const enq = await request(app).post('/api/enquiries').set(auth(salesToken)).send({
      customer: { companyName: 'Calc Co', contactPerson: 'X', mobile: '9876543210', email: 'x@c.com', city: 'Pune' },
      requiredDate: future(), items: [{ productId: String(p1._id), quantity: 10 }, { productId: String(p2._id), quantity: 5 }],
    });
    const res = await request(app).post('/api/quotations').set(auth(salesToken)).send({
      enquiryId: enq.body._id, validUntil: future(), grandTotal: 1, // tampered
      items: [
        { productId: String(p1._id), quantity: 10, unitPrice: 100, discountPct: 10, gstPct: 18 },
        { productId: String(p2._id), quantity: 5, unitPrice: 200, discountPct: 0, gstPct: 12 },
      ],
    });
    expect(res.status).toBe(201);
    // item 1: 1000 - 10% = 900, +18% GST = 1062 | item 2: 1000 + 12% = 1120
    expect(res.body.items[0].lineAmount).toBe(1062);
    expect(res.body.items[1].lineAmount).toBe(1120);
    expect(res.body.grandTotal).toBe(2182);
  });
});

describe('2. Draft / Rejected quotations cannot create orders', () => {
  test('DRAFT is refused', async () => {
    const p = await newProduct(100); const q = await makeQuotation(p._id, 5);
    const res = await convert(q._id);
    expect(res.status).toBe(409); expect(res.body.message).toMatch(/ACCEPTED/);
  });
  test('REJECTED is refused', async () => {
    const p = await newProduct(100); const q = await makeQuotation(p._id, 5);
    await setStatus(q._id, 'SENT'); await setStatus(q._id, 'REJECTED');
    expect((await convert(q._id)).status).toBe(409);
    expect(await SalesOrder.countDocuments({ quotation: q._id })).toBe(0);
  });
});

describe('3. One quotation -> one Sales Order', () => {
  test('second conversion is refused', async () => {
    const p = await newProduct(100); const q = await makeQuotation(p._id, 5);
    await setStatus(q._id, 'SENT'); await setStatus(q._id, 'ACCEPTED');
    expect((await convert(q._id)).status).toBe(201);
    expect((await convert(q._id)).status).toBe(409);
  });
  test('simultaneous conversions create exactly one order', async () => {
    const p = await newProduct(100); const q = await makeQuotation(p._id, 5);
    await setStatus(q._id, 'SENT'); await setStatus(q._id, 'ACCEPTED');
    const results = await Promise.all([convert(q._id), convert(q._id), convert(q._id)]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await SalesOrder.countDocuments({ quotation: q._id })).toBe(1);
  });
});

describe('4. Stock reservation', () => {
  test('cannot reserve more than available; reserves correctly when enough', async () => {
    const p = await newProduct(100, 30); // available 70
    const big = await makeOrder(p._id, 80);
    const fail = await confirm(big._id);
    expect(fail.status).toBe(409); expect(fail.body.message).toMatch(/available 70/);
    expect(await stock(p)).toEqual({ physical: 100, reserved: 30, available: 70 });
    expect((await SalesOrder.findById(big._id)).status).toBe('PENDING');

    const ok = await makeOrder(p._id, 60);
    expect((await confirm(ok._id)).status).toBe(200);
    expect(await stock(p)).toEqual({ physical: 100, reserved: 90, available: 10 });
  });
  test('damaged stock is excluded from availability', async () => {
    const p = await newProduct(100); await Inventory.updateOne({ product: p._id }, { damaged: 10 });
    const o = await makeOrder(p._id, 95);
    expect((await confirm(o._id)).status).toBe(409);
  });
});

describe('5. Role based access control', () => {
  test('sales user cannot confirm, dispatch or edit inventory; anonymous gets 401', async () => {
    const p = await newProduct(100); const o = await makeOrder(p._id, 10);
    expect((await request(app).post(`/api/sales-orders/${o._id}/confirm`).set(auth(salesToken))).status).toBe(403);
    expect((await request(app).post(`/api/sales-orders/${o._id}/dispatch`).set(auth(salesToken)).send({ vehicleNumber: 'MH12AB1234', driverName: 'Ramesh' })).status).toBe(403);
    expect((await request(app).put(`/api/inventory/${p._id}`).set(auth(salesToken)).send({ physical: 999 })).status).toBe(403);
    expect((await request(app).get('/api/sales-orders')).status).toBe(401);
  });
  test('admin cannot create enquiries (sales-only action)', async () => {
    const res = await request(app).post('/api/enquiries').set(auth(adminToken)).send({});
    expect(res.status).toBe(403);
  });
});

describe('Bonus: concurrent reservations', () => {
  test('available 100, reserve 80 and 50 at the same time -> only one succeeds', async () => {
    const p = await newProduct(100);
    const [a, b] = [await makeOrder(p._id, 80), await makeOrder(p._id, 50)];
    const [ra, rb] = await Promise.all([confirm(a._id), confirm(b._id)]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    const s = await stock(p);
    expect([80, 50]).toContain(s.reserved);
    expect(s.available).toBeGreaterThanOrEqual(0);
  });
  test('the same order confirmed twice at once reserves only once', async () => {
    const p = await newProduct(100); const o = await makeOrder(p._id, 40);
    const rs = await Promise.all([confirm(o._id), confirm(o._id), confirm(o._id)]);
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await stock(p)).reserved).toBe(40);
  });
});

describe('Dispatch & cancellation', () => {
  const dispatch = (id) => request(app).post(`/api/sales-orders/${id}/dispatch`).set(auth(adminToken)).send({ vehicleNumber: 'MH12AB1234', driverName: 'Ramesh Patil' });

  test('dispatch reduces physical and reserved; duplicate dispatch is refused', async () => {
    const p = await newProduct(100, 0); const o = await makeOrder(p._id, 60);
    await confirm(o._id);
    expect(await stock(p)).toEqual({ physical: 100, reserved: 60, available: 40 });
    const d = await dispatch(o._id);
    expect(d.status).toBe(201);
    expect(await stock(p)).toEqual({ physical: 40, reserved: 0, available: 40 });
    expect((await dispatch(o._id)).status).toBe(409);
    expect(await stock(p)).toEqual({ physical: 40, reserved: 0, available: 40 });
  });
  test('pending and cancelled orders cannot be dispatched', async () => {
    const p = await newProduct(100); const o = await makeOrder(p._id, 10);
    expect((await dispatch(o._id)).status).toBe(409); // still PENDING
    await confirm(o._id);
    await request(app).post(`/api/sales-orders/${o._id}/cancel`).set(auth(adminToken));
    expect((await dispatch(o._id)).status).toBe(409);
  });
  test('cancelling a confirmed order releases its reservation', async () => {
    const p = await newProduct(100); const o = await makeOrder(p._id, 25);
    await confirm(o._id);
    expect((await stock(p)).reserved).toBe(25);
    const res = await request(app).post(`/api/sales-orders/${o._id}/cancel`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(await stock(p)).toEqual({ physical: 100, reserved: 0, available: 100 });
  });
});
