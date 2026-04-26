'use strict';
const { pool } = require('../db');
const logger = require('../utils/logger').child({ service: 'matching-engine' });

// In-memory guard — prevents duplicate sends on same order
const processing = new Set();

async function runMatchingCycle() {
  const { rows: txns } = await pool.query(
    `SELECT * FROM wallet_transactions WHERE status='unmatched' ORDER BY detected_at ASC`
  );
  if (!txns.length) return;

  logger.debug(`Matching cycle: ${txns.length} unmatched transaction(s)`);
  for (const txn of txns) await matchTransaction(txn);
}

async function matchTransaction(txn) {
  try {
    // Strict match: network + coin_symbol + EXACT unique_crypto_amount
    // Intentionally does NOT filter on expires_at — honours late payers
    const { rows: orders } = await pool.query(
      `SELECT * FROM orders
       WHERE network              = $1
         AND coin_symbol          = $2
         AND unique_crypto_amount = $3
         AND status               = 'waiting_payment'
       LIMIT 1`,
      [txn.network, txn.coin_symbol, txn.amount.toString()]
    );

    if (!orders.length) {
      // No match — leave as unmatched, notify admin via Container 2
      logger.warn('Unmatched transaction — flagged for admin review', {
        txHash: txn.tx_hash, network: txn.network, coin: txn.coin_symbol, amount: txn.amount,
      });
      const notify = require('../bot/notify');
      notify.unmatchedTransaction(txn);
      return { matched: false };
    }

    const order = orders[0];

    if (processing.has(order.id)) {
      logger.debug('Order already processing', { orderId: order.id });
      return;
    }

    processing.add(order.id);

    try {
      const isLate   = new Date() > new Date(order.expires_at);
      const txStatus = isLate ? 'expired_match' : 'matched';

      if (isLate) {
        logger.info('Late payer — honoring deal (exact amount matched)', { orderId: order.id });
      }

      // Link transaction to order
      await pool.query(
        `UPDATE wallet_transactions SET status=$1, order_id=$2 WHERE id=$3`,
        [txStatus, order.id, txn.id]
      );

      // Update order
      await pool.query(
        `UPDATE orders
         SET status='matched', tx_hash_in=$1, block_number_in=$2, matched_at=NOW(), updated_at=NOW()
         WHERE id=$3`,
        [txn.tx_hash, txn.block_number, order.id]
      );

      // Mark order as pending manual release (admin will send tokens manually)
      await pool.query(
        `UPDATE orders SET status='pending_release', updated_at=NOW() WHERE id=$1`,
        [order.id]
      );

      logger.info('Order matched — awaiting manual release', {
        orderId: order.id, txHash: txn.tx_hash, tokens: order.token_amount, late: isLate,
      });

      // Notify admin: payment received, manual action required
      const notify = require('../bot/notify');
      notify.paymentDetected({
        ...order,
        status:      'pending_release',
        tx_hash_in:  txn.tx_hash,
        network:     txn.network,
        coin_symbol: txn.coin_symbol,
      });

      return { matched: true };
    } finally {
      setTimeout(() => processing.delete(order.id), 15_000);
    }

  } catch (err) {
    logger.error('matchTransaction error', { txId: txn.id, error: err.message });
  }
}

function start() {
  logger.info('Matching engine started');
  setInterval(async () => {
    try { await runMatchingCycle(); }
    catch (err) { logger.error('Matching cycle error', { error: err.message }); }
  }, 25_000);
}

module.exports = { start, runMatchingCycle };
