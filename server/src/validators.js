const { z } = require('zod');

const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const qty = z.coerce.number().int('Must be a whole number').positive('Must be greater than 0');

const customer = z.object({
  companyName: z.string().trim().min(1, 'Company name is required'),
  contactPerson: z.string().trim().min(1, 'Contact person is required'),
  mobile: z.string().trim().regex(/^\+?[\d\s-]{8,15}$/, 'Enter a valid mobile number'),
  email: z.string().trim().email('Enter a valid email'),
  city: z.string().trim().min(1, 'City is required'),
});

const uniqueProducts = (items) => new Set(items.map((i) => i.productId)).size === items.length;

const login = z.object({ email: z.string().email(), password: z.string().min(1) });
const register = z.object({
  name: z.string().trim().min(1),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['ADMIN', 'SALES']),
});

const enquiry = z
  .object({
    customerId: oid.optional(),
    customer: customer.optional(),
    requiredDate: z.coerce.date(),
    notes: z.string().max(1000).optional().default(''),
    items: z.array(z.object({ productId: oid, quantity: qty })).min(1, 'Add at least one product'),
  })
  .refine((d) => d.customerId || d.customer, { message: 'Provide an existing customer or new customer details', path: ['customer'] })
  .refine((d) => uniqueProducts(d.items), { message: 'A product can only appear once', path: ['items'] });

const quotation = z
  .object({
    enquiryId: oid,
    validUntil: z.coerce.date(),
    items: z
      .array(
        z.object({
          productId: oid,
          quantity: qty,
          unitPrice: z.coerce.number().min(0).optional(),
          discountPct: z.coerce.number().min(0).max(100).default(0),
          gstPct: z.coerce.number().min(0).max(100).default(18),
        })
      )
      .min(1)
      .optional(),
  })
  .refine((d) => !d.items || uniqueProducts(d.items), { message: 'A product can only appear once', path: ['items'] });

const quotationStatus = z.object({ status: z.enum(['SENT', 'ACCEPTED', 'REJECTED']) });
const enquiryStatus = z.object({ status: z.enum(['LOST']) });

const dispatch = z.object({
  vehicleNumber: z.string().trim().min(4, 'Vehicle number is required'),
  driverName: z.string().trim().min(2, 'Driver name is required'),
  dispatchDate: z.coerce.date().optional(),
});

const product = z.object({
  code: z.string().trim().min(2),
  name: z.string().trim().min(2),
  category: z.string().trim().min(2),
  unit: z.string().trim().min(1),
  basePrice: z.coerce.number().min(0),
  openingStock: z.coerce.number().int().min(0).default(0),
});

const inventory = z.object({
  physical: z.coerce.number().int().min(0),
  damaged: z.coerce.number().int().min(0).default(0),
});

module.exports = { login, register, enquiry, quotation, quotationStatus, enquiryStatus, dispatch, product, inventory, customer };
