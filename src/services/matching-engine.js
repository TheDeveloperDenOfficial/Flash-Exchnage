'use strict';
const { pool } = require('../db');
const { sendTokensWithRetry } = require('./token-sender');
const logger = require('../utils/logger').child({ service: 'matching-engine' });

// Track orders currently being processed to prevent double-sends
const processing = new Set();

/**
 * The core matching loop.
 * Called by the blockchain scanner after each scan cycle — also runs on its own interval.
 *
 * Logic:
 *   1. Find all unmatched transactions.
 *   2. For each transaction, attempt to find an order where:
 *      - network matches
 *      - coin_type matches
 *      - unique_crypto_amount matches EXACTLY (NUMERIC equality in Postgres)
 *      - order status is 'waiting_payment'
 *   3. If found:
 *      a. If order has NOT expired → normal flow → trigger token send.
 *      b. If order HAS expired but amount matches → "late payer" → still honor the deal.
 *   4. If NOT found → flag transaction as 'unmatched' for admin review.
 */
async function runMatchingCycle() {
  // Fetch all unprocessed incoming transactions
  const { rows: txns } = await pool.query(
    `SELECT * FROM wallet_transactions
     WHERE status = 'unmatched'
     ORDER BY detected_at ASC`
  );

  if (txns.length === 0) return;

  logger.debug(`Matching cycle: ${txns.length} unmatched transaction(s)`);

  for (const txn of txns) {
    await matchTransaction(txn);
  }
}

/**
 * Attempt to match a single transaction to a pending order.
 * @param {object} txn - Row from wallet_transactions
 */
async function matchTransaction(txn) {
  try {
    // Find matching order — strict equality on all three fields
    // This query intentionally does NOT filter on expires_at so we catch late payers too.
    const { rows: orders } = await pool.query(
      `SELECT * FROM orders
       WHERE network              = $1
         AND coin_type            = $2
         AND unique_crypto_amount = $3
         AND status               = 'waiting_payment'
       LIMIT 1`,
      [txn.network, txn.coin_type, txn.amount.toString()]
    );

    if (orders.length === 0) {
      // No matching order found — flag for manual admin review
      await pool.query(
        `UPDATE wallet_transactions
         SET status = 'unmatched', updated_at = NOW()
         WHERE id = $1`,
        [txn.id]
      );
      // Note: status was already 'unmatched', this is a no-op but makes the
      // intent explicit. In production you'd also send an admin alert here.
      logger.warn('Transaction has NO matching order — flagged for manual review', {
        txHash: txn.tx_hash,
        network: txn.network,
        coin: txn.coin_type,
        amount: txn.amount,
        from: txn.from_address,
      });
      return;
    }

    const order = orders[0];

    // Guard: prevent double-processing the same order
    if (processing.has(order.id)) {
      logger.debug('Order already being processed, skipping', { orderId: order.id });
      return;
    }

    // Guard: if order was already matched/completed by a race condition
    if (order.status !== 'waiting_payment') {
      logger.debug('Order status changed before match, skipping', {
        orderId: order.id,
        status: order.status,
      });
      return;
    }

    // Check expiry — late payers are still honored (per spec)
    const isLate = new Date() > new Date(order.expires_at);
    if (isLate) {
      logger.info('Late payer detected — honoring deal (exact amount matched)', {
        orderId: order.id,
        expiredAt: order.expires_at,
        txHash: txn.tx_hash,
      });
    }

    processing.add(order.id);

    try {
      // 1. Mark order as matched and link the incoming transaction
      await pool.query(
        `UPDATE orders
         SET status         = 'matched',
             tx_hash_in     = $1,
             block_number_in = $2,
             matched_at     = NOW(),
             updated_at     = NOW()
         WHERE id = $3`,
        [txn.tx_hash, txn.block_number, order.id]
      );

      // 2. Mark the transaction as matched
      await pool.query(
        `UPDATE wallet_transactions
         SET status    = $1,
             order_id  = $2
         WHERE id      = $3`,
        [isLate ? 'expired_match' : 'matched', order.id, txn.id]
      );

      logger.info('Order matched! Triggering token send…', {
        orderId: order.id,
        txHash: txn.tx_hash,
        amount: txn.amount,
        coin: txn.coin_type,
        tokens: order.token_amount,
        recipient: order.receiving_wallet,
        late: isLate,
      });

      // 3. Trigger token distribution (non-blocking — let it run async)
      sendTokensWithRetry({ ...order, status: 'matched' }).catch((err) => {
        logger.error('sendTokensWithRetry threw uncaught error', {
          orderId: order.id,
          error: err.message,
        });
      });

    } finally {
      // Remove from processing set after a short delay so very fast re-runs don't re-enter
      setTimeout(() => processing.delete(order.id), 10_000);
    }

  } catch (err) {
    logger.error('matchTransaction error', {
      txId: txn.id,
      txHash: txn.tx_hash,
      error: err.message,
    });
  }
}

/**
 * Start the matching engine on its own interval.
 * Also called directly by the blockchain scanner after each scan cycle.
 */
function start() {
  logger.info('Matching engine started');

  setInterval(async () => {
    try {
      await runMatchingCycle();
    } catch (err) {
      logger.error('Matching cycle error', { error: err.message });
    }
  }, 25_000); // Runs every 25s (scanner runs every 20s — slight offset intentional)
}

module.exports = { start, runMatchingCycle };
