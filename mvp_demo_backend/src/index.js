const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const config = require('./config');
const authRoutes = require('./routes/auth');
const proxyRoutes = require('./routes/proxy');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Log every request so you can see UI hitting the backend
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

/** Health (backend only) */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'mvp_demo_backend',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.use('/auth', authRoutes);
app.use('/', proxyRoutes);

async function start() {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
  app.listen(config.port, () => {
    console.log(`MVP demo backend listening on port ${config.port}`);
    console.log(`Auth: /auth/signup, /auth/login, /auth/users (admin), PATCH /auth/users/:id/access (admin)`);
    console.log(`Proxy to FastAPI: ${config.fastapiUrl || '(not set)'} (localhost forced to http)`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
