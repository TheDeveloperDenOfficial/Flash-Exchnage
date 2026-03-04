'use strict';
const express = require('express');
const { pool } = require('../../db');
const basicAuth = require('../middleware/basicAuth');
const { priceCache } = require('../../services/price-updater');
const config = require('../../config');
const logger = require('../../utils/logger').child({ service: 'admin-api' });

const router = express.Router();

// All admin routes require Basic Auth
router.use(basicAuth);

// ── GET /api/admin/stats ─────────────────────────────────────
/**
 * Returns aggregated sales statistics and system health info.
 */
router.get('/stats', async (req, res) => {
  try {
    // Total sales by status
    const { rows: orderStats } = await pool.query(`
      SELECT
        status,
        COUNT(*)                         AS count,
        SUM(usdt_amount)                 AS total_usd,
        SUM(token_amount)                AS total_tokens
      FROM orders
      GROUP BY status
      ORDER BY status
    `);

    // Unmatched transactions (need admin review)
    const { rows: unmatchedTxns } = await pool.query(`
      SELECT
        t.id,
        t.tx_hash,
        t.network,
        t.coin_type,
        t.from_address,
        t.amount,
        t.detected_at,
        t.status
      FROM wallet_transactions t
      WHERE t.status IN ('unmatched', 'manual_review')
      ORDER BY t.detected_at DESC
      LIMIT 100
    `);

    // Recent completed orders
    const { rows: recentOrders } = await pool.query(`
      SELECT
        id, status, payment_method, usdt_amount, token_amount,
        receiving_wallet, tx_hash_in, tx_hash_out, completed_at, created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 50
    `);

    // Revenue summary
    const { rows: revenue } = await pool.query(`
      SELECT
        COALESCE(SUM(usdt_amount), 0)    AS total_revenue_usd,
        COALESCE(SUM(token_amount), 0)   AS total_tokens_sold,
        COUNT(*)                          AS total_orders,
        COUNT(*) FILTER (WHERE status = 'completed')   AS completed_orders,
        COUNT(*) FILTER (WHERE status = 'waiting_payment') AS pending_orders,
        COUNT(*) FILTER (WHERE status = 'failed')      AS failed_orders,
        COUNT(*) FILTER (WHERE status = 'expired')     AS expired_orders
      FROM orders
      WHERE status = 'completed'
    `);

    // Today's stats
    const { rows: today } = await pool.query(`
      SELECT
        COALESCE(SUM(usdt_amount), 0) AS revenue_usd,
        COUNT(*) AS orders
      FROM orders
      WHERE status = 'completed'
        AND completed_at >= CURRENT_DATE
    `);

    // Wallet transaction counts
    const { rows: txStats } = await pool.query(`
      SELECT
        network,
        coin_type,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'matched')   AS matched,
        COUNT(*) FILTER (WHERE status = 'unmatched') AS unmatched
      FROM wallet_transactions
      GROUP BY network, coin_type
      ORDER BY network, coin_type
    `);

    return res.json({
      timestamp: new Date().toISOString(),
      summary: revenue.rows?.[0] || revenue[0],
      today: today[0],
      ordersByStatus: orderStats,
      recentOrders,
      unmatchedTransactions: {
        count: unmatchedTxns.length,
        items: unmatchedTxns,
      },
      transactionStats: txStats,
      livePrices: {
        BNB: priceCache.bnb?.usd || 0,
        ETH: priceCache.eth?.usd || 0,
        TRX: priceCache.trx?.usd || 0,
        USDT: 1.0,
        updatedAt: priceCache.bnb?.updatedAt || null,
      },
      config: {
        tokenSymbol: config.tokenSymbol,
        tokenPriceUsd: config.tokenPriceUsd,
        tokenNetwork: config.tokenNetwork,
        orderExpiryMinutes: config.orderExpiryMinutes,
      },
    });

  } catch (err) {
    logger.error('GET /api/admin/stats error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/admin/transactions ──────────────────────────────
/**
 * List all detected transactions with filters.
 * Query params: network, status, limit (default 100)
 */
router.get('/transactions', async (req, res) => {
  try {
    const { network, status, limit = 100 } = req.query;
    const params = [];
    const conditions = [];

    if (network) {
      params.push(network);
      conditions.push(`network = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(Math.min(parseInt(limit, 10) || 100, 500));

    const { rows } = await pool.query(
      `SELECT t.*, o.receiving_wallet, o.token_amount
       FROM wallet_transactions t
       LEFT JOIN orders o ON t.order_id = o.id
       ${where}
       ORDER BY t.detected_at DESC
       LIMIT $${params.length}`,
      params
    );

    return res.json({ count: rows.length, transactions: rows });
  } catch (err) {
    logger.error('GET /api/admin/transactions error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/admin/transactions/:id/flag ────────────────────
/**
 * Manually flag a transaction for review or mark as resolved.
 */
router.post('/transactions/:id/flag', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;

    const allowedStatuses = ['manual_review', 'unmatched', 'resolved'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowedStatuses.join(', ')}` });
    }

    await pool.query(
      `UPDATE wallet_transactions
       SET status = $1
       WHERE id = $2`,
      [status, parseInt(id, 10)]
    );

    logger.info('Transaction manually flagged', { txId: id, status, admin: req.headers['x-admin'] });
    return res.json({ success: true, id, status });
  } catch (err) {
    logger.error('POST /api/admin/transactions/:id/flag error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/admin/health ────────────────────────────────────
router.get('/health', async (_req, res) => {
  const { ping } = require('../../db');
  const dbOk = await ping().catch(() => false);
  return res.json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    node: process.version,
  });
});

module.exports = router;
