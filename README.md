# Foundry ERP — Enquiry → Quotation → Sales Order → Reservation → Dispatch

A small ERP workflow for an industrial supplier, built with the **MERN** stack
(MongoDB, Express, React, Node) — JWT auth, backend role checks, atomic stock reservation, and automated tests.

> **Note on the database:** the original case study names PostgreSQL (PERN). This project uses MongoDB because
> it was requested as MERN. Every rule from the brief is enforced in the backend/database layer; see
> [Concurrency](#how-double-booking-is-prevented). If you must submit PERN, the business logic maps 1:1 to SQL
> (`SELECT … FOR UPDATE` / conditional `UPDATE … WHERE available >= qty`).

## Tech stack
| Layer | Tools |
|---|---|
| Frontend | React 18, Vite, React Router, lucide-react (plain CSS, responsive) |
| Backend | Node.js, Express 4, Mongoose 8, Zod (validation), bcryptjs, jsonwebtoken, helmet, cors |
| Database | MongoDB 6/7 |
| Tests | Jest, Supertest, mongodb-memory-server |

## Features
- **Auth & roles** — JWT login, bcrypt hashing, protected APIs, RBAC enforced in Express middleware (UI hiding is cosmetic only).
- **Enquiries** — new or existing customer, multiple products, statuses `NEW → QUOTED → WON / LOST` (updated automatically by the quotation lifecycle).
- **Product master + inventory** — 8 seeded products; `Available = Physical − Reserved − Damaged`; admin stock adjustment and "add product".
- **Quotations** — `DRAFT → SENT → ACCEPTED / REJECTED`; the **server calculates** line amounts, discount, GST and grand total (client totals are ignored); expiry check on accept.
- **Quotation → Sales Order** — only `ACCEPTED`, only once, full traceability Customer → Enquiry → Quotation → Order.
- **Reservation** — admin confirms the order; stock is reserved atomically; physical stock is untouched.
- **Dispatch** — vehicle + driver; reduces physical **and** reserved; blocks duplicate dispatch, pending and cancelled orders.
- **Bonus (live-round ready)** — order cancellation releases reservations; `damaged` stock is part of availability.

### Roles
| Action | ADMIN | SALES |
|---|:-:|:-:|
| View records | all | own records |
| Create enquiries / quotations, accept/reject, convert | – | ✔ |
| View inventory availability | ✔ | ✔ |
| Adjust inventory, add products | ✔ | – |
| Confirm / cancel orders, dispatch | ✔ | – |

## Project structure
```
server/  src/{models,routes,middleware,utils,config}  seed.js  tests/
client/  src/{pages,ui.jsx,auth.jsx,api.js,styles.css}
docs/    ER-DIAGRAM.md  API.md  postman_collection.json
```

## Setup
Prerequisites: Node 18+, MongoDB running locally (or `docker compose up -d` from the project root).

```bash
# 1. Backend
cd server
npm install
cp .env.example .env      # edit JWT_SECRET / MONGO_URI if needed
npm run seed              # resets the DB and loads demo users, products, stock
npm run dev               # http://localhost:5000

# 2. Frontend (new terminal)
cd client
npm install
npm run dev               # http://localhost:5173
```

### Environment variables (`server/.env`)
| Name | Purpose | Default |
|---|---|---|
| `PORT` | API port | `5000` |
| `MONGO_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/erp_mern` |
| `JWT_SECRET` | Token signing secret | *(set your own)* |
| `JWT_EXPIRES_IN` | Token lifetime | `8h` |
| `CLIENT_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |
| `MONGO_URI_TEST` | *(optional)* real MongoDB for tests | in-memory server |

### Test login credentials
| Role | Email | Password |
|---|---|---|
| Admin | `admin@erp.com` | `Admin@123` |
| Sales | `sales@erp.com` | `Sales@123` |

## Running tests
```bash
cd server && npm test
```
The first run downloads a MongoDB binary for `mongodb-memory-server` (needs internet once). Or set `MONGO_URI_TEST`.

| # | Test |
|---|---|
| 1 | Quotation totals calculated by the backend (client-sent total ignored) |
| 2 | DRAFT / REJECTED quotations cannot create orders |
| 3 | A quotation cannot create duplicate orders (sequential **and** simultaneous) |
| 4 | Cannot reserve more than available (and damaged stock is excluded) |
| 5 | Unauthorized / wrong-role requests are rejected (401 / 403) |
| Bonus | Simultaneous reservations (80 + 50 of 100) — only one succeeds; same order confirmed 3× reserves once |
| Extra | Dispatch math, duplicate dispatch, cancelled/pending dispatch, cancel releases stock |

## How double-booking is prevented
Every stock change is **one conditional atomic update on a single inventory document**:

```js
Inventory.findOneAndUpdate(
  { product, $expr: { $gte: [{ $subtract: [{ $subtract: ['$physical', '$reserved'] }, '$damaged'] }, qty] } },
  { $inc: { reserved: qty } }
)
```
MongoDB applies single-document updates atomically, so "is there enough stock?" and "reserve it" can't be
separated by another request. With 100 available and two requests for 80 and 50, only one filter can match.
No replica set / transaction is needed for this.

Order state changes use the same pattern (`findOneAndUpdate({status:'PENDING'}, {status:'CONFIRMED'})`), so one order
can't be confirmed, dispatched or cancelled twice. Multi-line orders reserve line by line and **roll back** earlier
lines if a later one fails.

Trade-off to be ready to explain: with atomic single-document updates, a crash between two lines of a multi-line order
could leave a partial reservation. MongoDB multi-document transactions (replica set required) would close that gap;
the current design favours working on a plain local `mongod`.

## Workflow in the UI
1. **Sales** → *Enquiries* → New enquiry → *Quotations* → New quotation (prefilled from the enquiry) → Send → Accept → **Create order**.
2. **Admin** → *Sales Orders* → see stock check per line → **Confirm & reserve stock** → **Dispatch** (vehicle, driver).
3. *Sales Orders → Inventory* tab shows physical / reserved / damaged / available.

## API
See [`docs/API.md`](docs/API.md) and import [`docs/postman_collection.json`](docs/postman_collection.json)
(run **Auth → Login (admin)** or **Login (sales)** first; the token is stored automatically).

## Suggested commit history
Commit in steps (the brief checks for it): `init server + models`, `auth + RBAC`, `enquiries`, `quotations + calculation`,
`sales orders + reservation`, `dispatch + cancel`, `tests`, `react scaffolding`, `enquiries UI`, `quotations UI`, `orders & inventory UI`, `docs`.
