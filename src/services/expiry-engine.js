'use strict';
const { pool, getSetting } = require('../db');
const notify  = require('../bot/notify');
const logger  = require('../utils/logger').child({ service: 'expiry-engine' });

// ── Job 1: Expire unpaid orders ───────────────────────────────
// Runs every minute — marks waiting_payment orders as expired
// when their expires_at window has passed
async function runExpiryJob() {
  const { rows } = await pool.query(`
    UPDATE orders
    SET    status = 'expired', updated_at = NOW()
    WHERE  status     = 'waiting_payment'
      AND  expires_at < NOW()
    RETURNING *
  `);

  for (const order of rows) {
    logger.info('Order expired', {
      orderId:  order.id,
      tokens:   order.token_amount,
      method:   order.payment_method_code,
      expiredAt: order.expires_at,
    });
    notify.orderExpired(order);
  }

  if (rows.length > 0) {
    logger.info(`Expiry job: ${rows.length} order(s) expired`);
  }
}

// ── Job 2: Hard delete old expired orders ─────────────────────
// Runs once daily — deletes expired orders older than 7 days
// Deletes linked wallet_transactions first (foreign key safety)
async function runCleanupJob() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete linked wallet_transactions first
    const { rowCount: txDeleted } = await client.query(`
      DELETE FROM wallet_transactions
      WHERE order_id IN (
        SELECT id FROM orders
        WHERE  status     = 'expired'
          AND  expires_at < NOW() - INTERVAL '7 days'
      )
    `);

    // Now delete the expired orders
    const { rowCount: ordersDeleted } = await client.query(`
      DELETE FROM orders
      WHERE  status     = 'expired'
        AND  expires_at < NOW() - INTERVAL '7 days'
    `);

    await client.query('COMMIT');

    if (ordersDeleted > 0) {
      logger.info('Cleanup job complete', {
        ordersDeleted,
        transactionsDeleted: txDeleted,
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Cleanup job failed — rolled back', { error: err.message });
  } finally {
    client.release();
  }
}

// ── Scheduler ─────────────────────────────────────────────────
function start() {
  logger.info('Expiry engine started');

  // Job 1 — expire unpaid orders, runs every minute
  setInterval(async () => {
    try { await runExpiryJob(); }
    catch (err) { logger.error('Expiry job error', { error: err.message }); }
  }, 60_000);

  // Run immediately on startup to catch any expired orders from downtime
  runExpiryJob().catch(err => logger.error('Initial expiry job error', { error: err.message }));

  // Job 2 — cleanup old expired orders, runs once every 24 hours
  setInterval(async () => {
    try { await runCleanupJob(); }
    catch (err) { logger.error('Cleanup job error', { error: err.message }); }
  }, 24 * 60 * 60_000);

  // Run cleanup once on startup too (catches anything missed from downtime)
  runCleanupJob().catch(err => logger.error('Initial cleanup job error', { error: err.message }));
}

module.exports = { start };
