const mongoose = require('mongoose');
const env = require('./config/env');
const app = require('./app');

mongoose
  .connect(env.mongoUri)
  .then(async () => {
    await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // make sure unique indexes exist
    app.listen(env.port, () => console.log(`API running on http://localhost:${env.port}`));
  })
  .catch((err) => { console.error('MongoDB connection failed:', err.message); process.exit(1); });
