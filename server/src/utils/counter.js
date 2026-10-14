const Counter = require('../models/Counter');

// Atomic, collision-free document numbers: ENQ-2026-0001
async function nextNumber(prefix) {
  const key = `${prefix}-${new Date().getFullYear()}`;
  const c = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `${key}-${String(c.seq).padStart(4, '0')}`;
}
module.exports = { nextNumber };
