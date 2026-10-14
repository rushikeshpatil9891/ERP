const { Schema, model } = require('mongoose');
const item = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    discountPct: { type: Number, default: 0, min: 0, max: 100 },
    gstPct: { type: Number, default: 0, min: 0, max: 100 },
    baseAmount: Number,
    discountAmount: Number,
    gstAmount: Number,
    lineAmount: Number,
  },
  { _id: false }
);
module.exports = model('Quotation', new Schema(
  {
    number: { type: String, required: true, unique: true },
    enquiry: { type: Schema.Types.ObjectId, ref: 'Enquiry', required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    items: { type: [item], validate: (v) => v.length > 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    validUntil: { type: Date, required: true },
    status: { type: String, enum: ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'], default: 'DRAFT' },
    converted: { type: Boolean, default: false }, // atomic guard against double conversion
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
));
