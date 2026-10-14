const { Schema, model } = require('mongoose');
module.exports = model('Dispatch', new Schema(
  {
    number: { type: String, required: true, unique: true },
    salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true, unique: true },
    dispatchDate: { type: Date, default: Date.now },
    items: [{ _id: false, product: { type: Schema.Types.ObjectId, ref: 'Product' }, quantity: Number }],
    vehicleNumber: { type: String, required: true, trim: true, uppercase: true },
    driverName: { type: String, required: true, trim: true },
    dispatchedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
));
