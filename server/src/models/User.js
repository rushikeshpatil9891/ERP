const { Schema, model } = require('mongoose');
const schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'SALES'], required: true },
  },
  { timestamps: true }
);
schema.set('toJSON', { transform: (_d, r) => { delete r.passwordHash; delete r.__v; return r; } });
module.exports = model('User', schema);
