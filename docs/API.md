# REST API

Base URL `http://localhost:5000/api` · JSON · `Authorization: Bearer <token>` on everything except login.
Errors: `{ "message": "…", "details": [{ "field", "message" }] }` — 400 validation, 401 unauthenticated, 403 wrong role, 404 not found, 409 business-rule conflict.

| Method & path | Role | Description |
|---|---|---|
| POST `/auth/login` | public | `{email,password}` → `{token,user}` |
| GET `/auth/me` | any | Current user |
| POST `/auth/register` | ADMIN | Create a user `{name,email,password,role}` |
| GET `/products` | any | Product master |
| POST `/products` | ADMIN | Add product + opening stock |
| GET `/inventory` | any | Physical, reserved, damaged, available per product |
| PUT `/inventory/:productId` | ADMIN | Set `{physical, damaged}`; rejected if below reserved + damaged |
| GET/POST `/customers` | any / SALES | Customers |
| GET `/enquiries`, `/enquiries/:id` | any | ADMIN all, SALES own |
| POST `/enquiries` | SALES | `{customerId` or `customer{…}`, `requiredDate`, `notes`, `items[{productId,quantity}]}` |
| PATCH `/enquiries/:id/status` | SALES | `{status:"LOST"}` |
| GET `/quotations`, `/quotations/:id` | any | |
| POST `/quotations` | SALES | `{enquiryId, validUntil, items?[{productId,quantity,unitPrice?,discountPct,gstPct}]}` — totals always computed server-side |
| PATCH `/quotations/:id/status` | SALES | `{status: SENT｜ACCEPTED｜REJECTED}` (DRAFT→SENT→ACCEPTED/REJECTED) |
| POST `/quotations/:id/convert` | SALES | ACCEPTED quotation → Sales Order (once) |
| GET `/sales-orders`, `/sales-orders/:id` | any | Includes dispatch details |
| POST `/sales-orders/:id/confirm` | ADMIN | PENDING → CONFIRMED, reserves stock (409 if insufficient) |
| POST `/sales-orders/:id/dispatch` | ADMIN | `{vehicleNumber, driverName, dispatchDate?}` CONFIRMED → DISPATCHED |
| POST `/sales-orders/:id/cancel` | ADMIN | PENDING/CONFIRMED → CANCELLED, releases reservation |

## Calculation
```
base      = quantity × unitPrice
discount  = base × discountPct / 100
taxable   = base − discount
gst       = taxable × gstPct / 100
line      = taxable + gst            (rounded to 2 decimals)
grandTotal = Σ line
```
