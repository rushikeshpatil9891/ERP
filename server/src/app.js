const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();
app.use(helmet());
app.use(cors({ origin: env.clientOrigin }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/catalog'));
app.use('/api/enquiries', require('./routes/enquiries'));
app.use('/api/quotations', require('./routes/quotations'));
app.use('/api/sales-orders', require('./routes/salesOrders'));

app.use(notFound);
app.use(errorHandler);
module.exports = app;
