'use strict';
const { pool } = require('../db');
const logger = require('../utils/logger').child({ service: 'notify' });

let _bot = null;

function setBot(bot) { _bot = bot; }

async function getAdminIds() {
  try {
    const { rows } = await pool.query(
      `SELECT telegram_id FROM admins WHERE is_active = true`
    );
    return rows.map(r => r.telegram_id);
  } catch { return []; }
}

async function broadcast(message, opts = {}) {
  if (!_bot) return;
  const ids = await getAdminIds();
  for (const id of ids) {
    try {
      await _bot.telegram.sendMessage(id, message, { parse_mode: 'HTML', ...opts });
    } catch (err) {
      logger.debug('Notify failed for admin', { id, error: err.message });
    }
  }
}

// ── Event Notifications ───────────────────────────────────────

function newOrder(order) {
  const msg = [
    `🆕 <b>New Order Created</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Tokens:  <b>${Number(order.token_amount).toLocaleString()} FLASH</b>`,
    `Value:   $${parseFloat(order.usdt_amount).toFixed(2)} USD`,
    `Method:  ${order.payment_method_code.toUpperCase()}`,
    `Wallet:  <code>${order.receiving_wallet}</code>`,
    `ID:      <code>${order.id}</code>`,
  ].join('\n');
  broadcast(msg).catch(() => {});
}

function paymentDetected(order, txHash) {
  const msg = [
    `💰 <b>Payment Detected</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Order:   <code>${order.id}</code>`,
    `Tokens:  <b>${Number(order.token_amount).toLocaleString()} FLASH</b>`,
    `TX:      <code>${txHash}</code>`,
    `Status:  Sending tokens…`,
  ].join('\n');
  broadcast(msg).catch(() => {});
}

function orderCompleted(order, txHash) {
  const msg = [
    `✅ <b>Order Completed</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Order:   <code>${order.id}</code>`,
    `Tokens:  <b>${Number(order.token_amount).toLocaleString()} FLASH</b>`,
    `To:      <code>${order.receiving_wallet}</code>`,
    `TX Out:  <code>${txHash}</code>`,
  ].join('\n');
  broadcast(msg).catch(() => {});
}

function orderFailed(order, error) {
  const msg = [
    `❌ <b>Order FAILED — Action Required</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Order:   <code>${order.id}</code>`,
    `Tokens:  ${Number(order.token_amount).toLocaleString()} FLASH`,
    `Error:   ${error || 'Unknown error'}`,
    `\nPlease retry manually via 📋 Orders menu.`,
  ].join('\n');
  broadcast(msg).catch(() => {});
}

function unmatchedTransaction(txn) {
  const msg = [
    `🔴 <b>Unmatched Transaction</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Network: ${txn.network.toUpperCase()}`,
    `Coin:    ${txn.coin_symbol}`,
    `Amount:  <b>${txn.amount}</b>`,
    `From:    <code>${txn.from_address}</code>`,
    `TX:      <code>${txn.tx_hash}</code>`,
    `\nReview via 🔍 Unmatched menu.`,
  ].join('\n');
  broadcast(msg).catch(() => {});
}

function lowBalance(symbol, balance, threshold) {
  const msg = [
    `⚠️ <b>LOW BALANCE ALERT</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Token:     ${symbol}`,
    `Balance:   ${balance}`,
    `Threshold: ${threshold}`,
    `\nPlease top up the distribution wallet immediately.`,
  ].join('\n');
  broadcast(msg).catch(() => {});
}

function orderExpired(order) {
  const msg = [
    `⏰ <b>Order Expired (Unpaid)</b>`,
    `Order:  <code>${order.id}</code>`,
    `Tokens: ${Number(order.token_amount).toLocaleString()} FLASH`,
    `Value:  $${parseFloat(order.usdt_amount).toFixed(2)} USD`,
  ].join('\n');
  broadcast(msg).catch(() => {});
}

module.exports = { setBot, newOrder, paymentDetected, orderCompleted, orderFailed, unmatchedTransaction, lowBalance, orderExpired };
