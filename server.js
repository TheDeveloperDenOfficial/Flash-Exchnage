'use strict';
require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const { migrate, ensureBootstrapAdmin, pool } = require('./src/db');
const logger     = require('./src/utils/logger');
const config     = require('./src/config');
const notify      = require('./src/bot/notify');
const containers  = require('./src/bot/containers');

// Routes
const publicRoutes = require('./src/api/routes/public');
const orderRoutes  = require('./src/api/routes/orders');

// Services
const priceUpdater    = require('./src/services/price-updater');
const scanner         = require('./src/services/blockchain-scanner');
const matchingEngine  = require('./src/services/matching-engine');
const expiryEngine    = require('./src/services/expiry-engine');
const { checkBalances } = require('./src/services/token-sender');

// Bot
const { createBot } = require('./src/bot');

const app = express();

// ── Trust proxy (required when behind Nginx/Coolify reverse proxy) ──
app.set('trust proxy', 1);

// ── Security ──────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'] }));

// ── Rate Limits ───────────────────────────────────────────────
const apiLimit = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const orderLimit = rateLimit({
  windowMs: 10 * 60_000, max: 15,
  message: { error: 'Too many order attempts. Please wait a few minutes.' },
});

// ── Body Parser ───────────────────────────────────────────────
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false }));

// ── API Routes ────────────────────────────────────────────────
app.use('/api',        apiLimit, publicRoutes);
app.use('/api/order',  apiLimit, orderLimit, orderRoutes);

// ── Health ────────────────────────────────────────────────────
// Both /health and /api/health supported — Coolify uses /api/health by default
async function healthHandler(_req, res) {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()) });
  } catch {
    res.status(503).json({ status: 'error' });
  }
}
app.get('/health',     healthHandler);
app.get('/api/health', healthHandler);

// ── Static Frontend ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: config.env === 'production' ? '1d' : 0,
}));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error('Unhandled Express error', { error: err.message, path: req.path });
  res.status(500).json({ error: 'An unexpected error occurred' });
});

// ── Startup Sequence ──────────────────────────────────────────
async function start() {
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('  Flash Exchange Backend v2.0');
  logger.info(`  Environment: ${config.env}`);
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. Database migration (blocking)
  await migrate();

  // 2. Ensure bootstrap admin
  await ensureBootstrapAdmin();

  // 3. Start Telegram bot
  const bot = createBot();
  if (bot) {
    notify.setBot(bot);
    containers.setBot(bot);
    bot.launch({ dropPendingUpdates: true });
    logger.info('Telegram bot started');
    // Graceful stop
    process.once('SIGINT',  () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  }

  // 4. Price updater (must be first — order creation depends on prices)
  await priceUpdater.start();

  // 5. Matching engine
  matchingEngine.start();

  // 6. Expiry engine (expires unpaid orders + cleans up old records)
  expiryEngine.start();

  // 7. Blockchain scanner (calls matching engine after each cycle)
  await scanner.start();

  // 7. Initial balance check
  if (config.distributionWalletPrivateKey) {
    checkBalances().catch(err => logger.warn('Initial balance check failed', { error: err.message }));
  }

  // 8. HTTP server
  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info(`HTTP server listening on port ${config.port}`);
    logger.info(`Frontend:   http://localhost:${config.port}`);
    logger.info(`Health:     http://localhost:${config.port}/health`);
  });

  // ── Graceful Shutdown ─────────────────────────────────────
  async function shutdown(signal) {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await pool.end();
      logger.info('Shutdown complete');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('unhandledRejection', reason => logger.error('Unhandled rejection', { reason: String(reason) }));
}

start().catch(err => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});
