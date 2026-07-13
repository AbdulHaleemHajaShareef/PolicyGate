const cors = require('cors');
const express = require('express');
const morgan = require('morgan');

const authRoutes = require('./routes/authRoutes');
const apiRoutes = require('./routes/apiRoutes');

function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
  app.use(express.json());
  app.use(morgan('dev'));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', apiRoutes);

  app.use((req, res) => {
    res.status(404).json({ message: 'Not found' });
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  });

  return app;
}

module.exports = {
  createApp,
};
