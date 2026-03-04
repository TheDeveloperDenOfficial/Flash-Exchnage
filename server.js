'use strict';
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { migrate, pool } = require('./src/db');
const logger = require('./src/utils/logger');
const config = require('./src/config');

// ── Services ─────────────────────────────────────────────────
const priceUpdater    = require('./src/services/price-updater');
const blockchainScanner = require('./src/services/blockchain-scanner');
const matchingEngine  = require('./src/services/matching-engine');
const { checkBalancesAndWarn } = require('./src/services/token-sender');

// ── Routes ───────────────────────────────────────────────────
const orderRoutes = require('./src/api/routes/orders');
const adminRoutes = require('./src/api/routes/admin');

const app = express();

// ── Security Middleware ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Disabled so the frontend HTML can load external scripts/fonts
}));

// CORS — tighten in production by specifying exact origins
app.use(cors({
  origin: config.env === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',') || true
    : true,
  methods: ['GET', 'POST', 'OPTIONS'],
}));

// ── Rate Limiting ────────────────────────────────────────────
// Strict limit on order creation to prevent spam
const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,                   // 20 order attempts per IP per 10 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many order requests. Please wait a few minutes.' },
});

// General API limit
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Body Parser ───────────────────────────────────────────────
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

// ── Request Logging ──────────────────────────────────────────
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    logger.debug(`${req.method} ${req.path}`, {
      ip: req.ip,
      body: req.method === 'POST' ? sanitiseBody(req.body) : undefined,
    });
  }
  next();
});

function sanitiseBody(body) {
  if (!body) return body;
  const safe = { ...body };
  // Don't log private keys or passwords if accidentally sent
  delete safe.private_key;
  delete safe.password;
  return safe;
}

// ── API Routes ────────────────────────────────────────────────
app.use('/api/order',  apiLimiter, orderLimiter, orderRoutes);
app.use('/api/admin',  apiLimiter, adminRoutes);

// Health endpoint (no auth, no rate limit — for Coolify/Docker healthchecks)
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()) });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

// ── Static Frontend ───────────────────────────────────────────
// Serve the bundled frontend from the /public directory
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: config.env === 'production' ? '1d' : 0,
  etag: true,
}));

// SPA fallback — serve index.html for any unmatched GET route
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error('Unhandled Express error', { error: err.message, path: req.path });
  res.status(500).json({ error: 'An unexpected error occurred' });
});

// ── Startup Sequence ──────────────────────────────────────────
async function start() {
  logger.info('===========================================');
  logger.info('  Flash Exchange Backend Starting…');
  logger.info(`  Environment: ${config.env}`);
  logger.info(`  Token: ${config.tokenSymbol} @ $${config.tokenPriceUsd}`);
  logger.info('===========================================');

  // 1. Run DB migration (blocks until complete)
  await migrate();

  // 2. Start price updater first (order creation depends on prices)
  await priceUpdater.start();

  // 3. Start matching engine (needs prices + DB ready)
  matchingEngine.start();

  // 4. Start blockchain scanner (triggers matching after each cycle)
  await blockchainScanner.start();

  // 5. Initial distribution wallet balance check
  if (config.env === 'production') {
    checkBalancesAndWarn().catch((err) => {
      logger.warn('Initial balance check failed', { error: err.message });
    });
  }

  // 6. Start HTTP server
  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info(`HTTP server listening on port ${config.port}`);
    logger.info(`Frontend: http://localhost:${config.port}`);
    logger.info(`Admin:    http://localhost:${config.port}/api/admin/stats`);
  });

  // ── Graceful Shutdown ─────────────────────────────────────
  function shutdown(signal) {
    logger.info(`Received ${signal}. Graceful shutdown…`);
    server.close(async () => {
      await pool.end();
      logger.info('Server and DB pool closed. Bye!');
      process.exit(0);
    });
    // Force exit after 10 seconds
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  // Catch unhandled promise rejections — log but don't crash
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
  });
}

start().catch((err) => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});
