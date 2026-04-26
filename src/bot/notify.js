'use strict';
const { pushAlert, pushAlertWithButton, pushOrderEvent } = require('./containers');
const logger = require('../utils/logger').child({ service: 'notify' });

// ── Helpers ───────────────────────────────────────────────────

const n2 = (v) => parseFloat(v).toFixed(2);
const short = (addr) => addr ? `${addr.slice(0, 10)}…${addr.slice(-6)}` : '—';

// ── Order lifecycle → Container 3 ────────────────────────────

function paymentDetected(order) {
  // Push to Container 3 (live orders feed)
  pushOrderEvent({
    id:           order.id,
    status:       'pending_release',
    token_amount: order.token_amount,
    coin_symbol:  order.coin_symbol,
    network:      order.network,
    tx_hash_in:   order.tx_hash_in,
    updated_at:   new Date(),
  }).catch(e => logger.warn('notify.paymentDetected pushOrderEvent', e.message));

  // Push to Container 2 (alerts) with inline Release button
  const short = (addr) => addr ? `${addr.slice(0, 10)}…${addr.slice(-6)}` : '—';
  const text = [
    `💰 <b>Payment Received — Release Required</b>`,
    ``,
    `   <b>${Number(order.token_amount).toLocaleString()} FLASH</b>`,
    `   Paid: ${order.unique_crypto_amount} ${order.coin_symbol} (${(order.network || '').toUpperCase()})`,
    `   Send to: <code>${order.receiving_wallet}</code>`,
    `   <i>${short(order.receiving_wallet)}</i>`,
    ``,
    `   ⬇️  Transfer tokens manually then tap Release`,
  ].join('\n');

  pushAlertWithButton(text, `release_order_${order.id}`, '✅ Mark as Released')
    .catch(e => logger.warn('notify.paymentDetected pushAlert', e.message));
}

function orderReleased(order, releasedByName) {
  pushOrderEvent({
    id:           order.id,
    status:       'completed',
    token_amount: order.token_amount,
    coin_symbol:  order.coin_symbol,
    network:      order.network,
    tx_hash_in:   order.tx_hash_in,
    updated_at:   new Date(),
  }).catch(e => logger.warn('notify.orderReleased', e.message));
}


  pushOrderEvent({
    id:            order.id,
    status:        'completed',
    token_amount:  order.token_amount,
    coin_symbol:   order.coin_symbol,
    network:       order.network,
    tx_hash_in:    order.tx_hash_in,
    tx_hash_out:   txHashOut,
    updated_at:    new Date(),
  }).catch(e => logger.warn('notify.orderCompleted', e.message));
}

function orderSending(order) {
  pushOrderEvent({
    id:           order.id,
    status:       'sending',
    token_amount: order.token_amount,
    coin_symbol:  order.coin_symbol,
    network:      order.network,
    tx_hash_in:   order.tx_hash_in,
    updated_at:   new Date(),
  }).catch(e => logger.warn('notify.orderSending', e.message));
}

// ── Alerts → Container 2 ──────────────────────────────────────

function orderFailed(order, error) {
  const text = [
    `❌ <b>Order Failed — Action Required</b>`,
    `   <b>${Number(order.token_amount).toLocaleString()} FLASH</b>  |  ${order.coin_symbol} (${(order.network || '').toUpperCase()})`,
    `   Error: ${error || 'Unknown'}`,
    `   → Use 📦 Orders to retry`,
  ].join('\n');
  pushAlert(text).catch(e => logger.warn('notify.orderFailed', e.message));
}

function unmatchedTransaction(txn) {
  const text = [
    `🔴 <b>Unmatched Transaction</b>`,
    `   ${txn.network.toUpperCase()}  |  ${txn.coin_symbol}  |  <b>${txn.amount}</b>`,
    `   From: <code>${short(txn.from_address)}</code>`,
    `   → Review in 🔍 Unmatched`,
  ].join('\n');
  pushAlert(text).catch(e => logger.warn('notify.unmatchedTransaction', e.message));
}

function lowBalance(symbol, balance, threshold) {
  const text = [
    `⚠️ <b>Low Balance — Action Required</b>`,
    `   ${symbol}: <b>${balance}</b>  |  Threshold: ${threshold}`,
    `   → Top up distribution wallet`,
  ].join('\n');
  pushAlert(text).catch(e => logger.warn('notify.lowBalance', e.message));
}

// ── Removed (no longer notify) ────────────────────────────────
// newOrder   — noise, not actionable
// orderExpired — noise, unpaid orders expire silently

module.exports = {
  paymentDetected,
  orderReleased,
  orderCompleted,
  orderSending,
  orderFailed,
  unmatchedTransaction,
  lowBalance,
};
