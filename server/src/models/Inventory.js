const { Schema, model } = require('mongoose');
// One document per product. available = physical - reserved - damaged (computed, never stored).
// DB-level guard rails: no field can go negative.
const schema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
    physical: { type: Number, required: true, min: 0, default: 0 },
    reserved: { type: Number, required: true, min: 0, default: 0 },
    damaged: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true }
);
schema.virtual('available').get(function () { return this.physical - this.reserved - this.damaged; });
schema.set('toJSON', { virtuals: true });
module.exports = model('Inventory', schema);
