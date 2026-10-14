# Data model

Renders on GitHub / VS Code (Mermaid). Traceability: **Customer → Enquiry → Quotation → Sales Order → Dispatch**.

```mermaid
erDiagram
    USER      { ObjectId _id string email UK string passwordHash string role "ADMIN|SALES" }
    CUSTOMER  { ObjectId _id string companyName string contactPerson string mobile string email string city ObjectId createdBy FK }
    PRODUCT   { ObjectId _id string code UK string name string category string unit number basePrice }
    INVENTORY { ObjectId _id ObjectId product FK_UK number physical number reserved number damaged }
    ENQUIRY   { ObjectId _id string number UK ObjectId customer FK date requiredDate string status "NEW|QUOTED|WON|LOST" }
    QUOTATION { ObjectId _id string number UK ObjectId enquiry FK ObjectId customer FK number grandTotal date validUntil string status "DRAFT|SENT|ACCEPTED|REJECTED" boolean converted }
    SALES_ORDER { ObjectId _id string number UK ObjectId quotation FK_UK ObjectId customer FK number totalAmount string status "PENDING|CONFIRMED|DISPATCHED|CANCELLED" }
    DISPATCH  { ObjectId _id string number UK ObjectId salesOrder FK_UK string vehicleNumber string driverName date dispatchDate }

    CUSTOMER ||--o{ ENQUIRY : raises
    ENQUIRY  ||--o{ QUOTATION : "priced by"
    QUOTATION ||--o| SALES_ORDER : "converts to (once)"
    SALES_ORDER ||--o| DISPATCH : "shipped by (once)"
    PRODUCT  ||--|| INVENTORY : "stock of"
    USER ||--o{ ENQUIRY : creates
```

Line items (`enquiry.items`, `quotation.items`, `sales_order.items`) are embedded sub-documents of
`{ product (ref), quantity, ... }` — the MongoDB equivalent of the `*_items` tables in a relational model.

## Key constraints
| Rule | How it is enforced |
|---|---|
| One quotation → one order | `sales_orders.quotation` unique index **and** atomic `converted: false → true` flip |
| One dispatch per order | `dispatches.salesOrder` unique index **and** atomic `CONFIRMED → DISPATCHED` claim |
| One inventory row per product | `inventory.product` unique index |
| No negative stock | `min: 0` on every inventory field + conditional updates (`$expr`) |
| Unique document numbers | unique indexes + atomic counter (`counters` collection) |
