const { Schema, model } = require('mongoose');
const item = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);
module.exports = model('SalesOrder', new Schema(
  {
    number: { type: String, required: true, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    enquiry: { type: Schema.Types.ObjectId, ref: 'Enquiry', required: true },
    // unique => one quotation can never produce two orders, even under a race
    quotation: { type: Schema.Types.ObjectId, ref: 'Quotation', required: true, unique: true },
    orderDate: { type: Date, default: Date.now },
    items: { type: [item], validate: (v) => v.length > 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['PENDING', 'CONFIRMED', 'DISPATCHED', 'CANCELLED'], default: 'PENDING' },
    confirmedAt: Date,
    cancelledAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
));
