const { Schema, model } = require('mongoose');
const item = new Schema(
  { product: { type: Schema.Types.ObjectId, ref: 'Product', required: true }, quantity: { type: Number, required: true, min: 1 } },
  { _id: false }
);
module.exports = model('Enquiry', new Schema(
  {
    number: { type: String, required: true, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    enquiryDate: { type: Date, default: Date.now },
    requiredDate: { type: Date, required: true },
    items: { type: [item], validate: (v) => v.length > 0 },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['NEW', 'QUOTED', 'WON', 'LOST'], default: 'NEW' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
));
