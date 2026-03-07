'use strict';
const { pushAlert, pushOrderEvent } = require('./containers');
const logger = require('../utils/logger').child({ service: 'notify' });

// ── Helpers ───────────────────────────────────────────────────

const n2 = (v) => parseFloat(v).toFixed(2);
const short = (addr) => addr ? `${addr.slice(0, 10)}…${addr.slice(-6)}` : '—';

// ── Order lifecycle → Container 3 ────────────────────────────

function paymentDetected(order) {
  pushOrderEvent({
    id:           order.id,
    status:       'matched',
    token_amount: order.token_amount,
    coin_symbol:  order.coin_symbol,
    network:      order.network,
    tx_hash_in:   order.tx_hash_in,
    updated_at:   new Date(),
  }).catch(e => logger.warn('notify.paymentDetected', e.message));
}

function orderCompleted(order, txHashOut) {
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
  orderCompleted,
  orderSending,
  orderFailed,
  unmatchedTransaction,
  lowBalance,
};
