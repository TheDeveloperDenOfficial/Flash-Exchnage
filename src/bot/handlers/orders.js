'use strict';
const { Markup } = require('telegraf');
const { pool } = require('../../db');
const { sendTokensWithRetry } = require('../../services/token-sender');
const { withHomeButton } = require('../middleware/menu');
const { smartEdit, smartReply } = require('../middleware/smartEdit');

const PAGE_SIZE = 8;

const STATUS_EMOJI = {
  completed: '✅', waiting_payment: '⏳', failed: '❌',
  expired: '⏰', matched: '🔍', sending: '📤', manually_completed: '🛠',
};

function fmtOrder(o, index) {
  const age     = timeSince(o.created_at);
  const emoji   = STATUS_EMOJI[o.status] || '•';
  const expires = o.status === 'waiting_payment'
    ? `\n  ⏳ Expires: ${msToCountdown(new Date(o.expires_at) - Date.now())}` : '';
  return [
    `<b>#${index + 1}</b>  ${emoji} <b>${o.status}</b>  <i>${age}</i>`,
    `  ${Number(o.token_amount).toLocaleString()} FLASH — $${parseFloat(o.usdt_amount).toFixed(2)}`,
    `  ${o.unique_crypto_amount} ${o.coin_symbol}  ·  <code>${o.receiving_wallet.slice(0,10)}…${o.receiving_wallet.slice(-6)}</code>${expires}`,
  ].join('\n');
}

async function handleOrders(ctx, offset = 0) {
  const [{ rows }, { rows: total }] = await Promise.all([
    pool.query(`SELECT * FROM orders ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [PAGE_SIZE, offset]),
    pool.query(`SELECT COUNT(*) AS cnt FROM orders`),
  ]);

  const totalCount = parseInt(total[0].cnt, 10);

  if (!rows.length) {
    return smartEdit(ctx, `📋 <b>Orders</b>\n\nNo orders found yet.`, {
      parse_mode: 'HTML',
      ...withHomeButton([]),
    });
  }

  const lines = rows.map((o, i) => fmtOrder(o, offset + i)).join('\n\n');
  const msg   = [
    `📋 <b>Orders</b>  <i>${offset + 1}–${offset + rows.length} of ${totalCount}</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    lines,
  ].join('\n');

  const navRow = [];
  if (offset > 0)                        navRow.push(Markup.button.callback('⬅️  Newer', `orders_page_${offset - PAGE_SIZE}`));
  if (offset + rows.length < totalCount) navRow.push(Markup.button.callback('➡️  Older', `orders_page_${offset + PAGE_SIZE}`));

  const detailBtns = [];
  for (let i = 0; i < rows.length; i += 2) {
    const row = [Markup.button.callback(`👁  #${offset + i + 1}`, `order_detail_${rows[i].id}`)];
    if (rows[i + 1]) row.push(Markup.button.callback(`👁  #${offset + i + 2}`, `order_detail_${rows[i + 1].id}`));
    detailBtns.push(row);
  }

  const keyboard = withHomeButton([
    ...(navRow.length ? [navRow] : []),
    ...detailBtns,
  ]);

  await smartEdit(ctx, msg, { parse_mode: 'HTML', ...keyboard });
}

async function handleOrderDetail(ctx, orderId) {
  const { rows } = await pool.query(`SELECT * FROM orders WHERE id=$1`, [orderId]);
  if (!rows.length) { await ctx.answerCbQuery('Order not found'); return; }

  const o         = rows[0];
  const emoji     = STATUS_EMOJI[o.status] || '•';
  const explorers = { bsc: 'https://bscscan.com/tx/', eth: 'https://etherscan.io/tx/', tron: 'https://tronscan.org/#/transaction/' };
  const explorer  = explorers[o.network] || explorers.bsc;
  const txIn      = o.tx_hash_in  ? `<a href="${explorer}${o.tx_hash_in}">${o.tx_hash_in.slice(0,18)}…</a>`  : 'Pending';
  const txOut     = o.tx_hash_out ? `<a href="${explorer}${o.tx_hash_out}">${o.tx_hash_out.slice(0,18)}…</a>` : 'Pending';

  const msg = [
    `🔍 <b>Order Detail</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `ID:         <code>${o.id}</code>`,
    `Status:     ${emoji} ${o.status}`,
    `Created:    ${new Date(o.created_at).toLocaleString()}`,
    o.completed_at ? `Completed:  ${new Date(o.completed_at).toLocaleString()}` : '',
    ``,
    `<b>Purchase</b>`,
    `  Tokens:   ${Number(o.token_amount).toLocaleString()} FLASH`,
    `  USD:      $${parseFloat(o.usdt_amount).toFixed(2)}`,
    `  Price:    $${o.token_price_snapshot} / token`,
    ``,
    `<b>Payment</b>`,
    `  Method:   ${o.payment_method_code.toUpperCase()}`,
    `  Expected: ${o.unique_crypto_amount} ${o.coin_symbol}`,
    `  TX In:    ${txIn}`,
    ``,
    `<b>Delivery</b>`,
    `  Wallet:   <code>${o.receiving_wallet}</code>`,
    `  TX Out:   ${txOut}`,
    `  Retries:  ${o.retry_count}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].filter(Boolean).join('\n');

  const actionRows = [];
  if (o.status === 'failed') {
    actionRows.push([Markup.button.callback('🔁  Retry Send', `order_retry_${o.id}`)]);
  }
  actionRows.push([Markup.button.callback('🔙  Back to Orders', 'nav_orders')]);
  actionRows.push([Markup.button.callback('🏠  Main Menu', 'nav_home')]);

  await smartEdit(ctx, msg, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(actionRows),
  });
}

async function handleOrderRetry(ctx, orderId) {
  const { rows } = await pool.query(`SELECT * FROM orders WHERE id=$1 AND status='failed'`, [orderId]);
  if (!rows.length) return ctx.answerCbQuery('Order is not in failed state');

  await ctx.answerCbQuery('Retrying…');
  // Retrying is a background action — edit the current message to show progress
  await smartEdit(ctx, `🔁 <b>Retrying token send…</b>\n\nOrder: <code>${orderId}</code>\nPlease wait…`, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[Markup.button.callback('🏠  Main Menu', 'nav_home')]]),
  });

  sendTokensWithRetry(rows[0]).then(async result => {
    if (result.success) {
      await smartReply(ctx, `✅ <b>Retry successful!</b>\nTX: <code>${result.txHash}</code>`, { parse_mode: 'HTML' });
    } else {
      await smartReply(ctx, `❌ <b>Retry failed:</b> ${result.error}`, { parse_mode: 'HTML' });
    }
  }).catch(err => smartReply(ctx, `❌ Error: ${err.message}`, { parse_mode: 'HTML' }));
}

// ── Helpers ───────────────────────────────────────────────────
function timeSince(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function msToCountdown(ms) {
  if (ms <= 0) return 'Expired';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

module.exports = { handleOrders, handleOrderDetail, handleOrderRetry };
