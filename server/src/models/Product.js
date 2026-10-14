const { Schema, model } = require('mongoose');
module.exports = model('Product', new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },
    basePrice: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
));
