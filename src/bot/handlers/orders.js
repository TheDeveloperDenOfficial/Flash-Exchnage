'use strict';
const { Markup } = require('telegraf');
const { pool } = require('../../db');
const { sendTokensWithRetry } = require('../../services/token-sender');

const PAGE_SIZE = 10;

const STATUS_EMOJI = {
  completed: '✅', waiting_payment: '⏳', failed: '❌',
  expired: '⏰', matched: '🔍', sending: '📤', manually_completed: '🛠',
};

function fmtOrder(o, index) {
  const age     = timeSince(o.created_at);
  const emoji   = STATUS_EMOJI[o.status] || '•';
  const expires = o.status === 'waiting_payment'
    ? `\n  Expires: ${msToCountdown(new Date(o.expires_at) - Date.now())}` : '';
  return [
    `<b>#${index + 1} — ${age}</b>`,
    `  Status:  ${emoji} ${o.status}`,
    `  Amount:  ${Number(o.token_amount).toLocaleString()} FLASH / $${parseFloat(o.usdt_amount).toFixed(2)}`,
    `  Paid:    ${o.unique_crypto_amount} ${o.coin_symbol}`,
    `  Wallet:  <code>${o.receiving_wallet.slice(0, 10)}...${o.receiving_wallet.slice(-6)}</code>${expires}`,
  ].join('\n');
}

async function handleOrders(ctx, offset = 0) {
  const { rows } = await pool.query(
    `SELECT * FROM orders ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [PAGE_SIZE, offset]
  );
  const { rows: total } = await pool.query(`SELECT COUNT(*) AS cnt FROM orders`);
  const totalCount = parseInt(total[0].cnt, 10);

  if (!rows.length) {
    return ctx.reply('📋 No orders found.');
  }

  const lines = rows.map((o, i) => fmtOrder(o, offset + i)).join('\n\n');
  const msg   = `📋 <b>Orders (${offset + 1}–${offset + rows.length} of ${totalCount})</b>\n━━━━━━━━━━━━━━━━━━━━\n\n${lines}`;

  const navBtns = [];
  if (offset > 0) navBtns.push(Markup.button.callback('⬅️ Newer', `orders_page_${offset - PAGE_SIZE}`));
  if (offset + rows.length < totalCount) navBtns.push(Markup.button.callback('➡️ Older', `orders_page_${offset + PAGE_SIZE}`));

  const detailBtns = rows.map((o, i) =>
    [Markup.button.callback(`👁 #${offset + i + 1} Details`, `order_detail_${o.id}`)]
  );

  await ctx.reply(msg, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([...detailBtns, navBtns.length ? navBtns : []]),
  });
}

async function handleOrderDetail(ctx, orderId) {
  const { rows } = await pool.query(`SELECT * FROM orders WHERE id=$1`, [orderId]);
  if (!rows.length) return ctx.reply('Order not found.');

  const o          = rows[0];
  const emoji      = STATUS_EMOJI[o.status] || '•';
  const explorers  = { bsc: 'https://bscscan.com/tx/', eth: 'https://etherscan.io/tx/', tron: 'https://tronscan.org/#/transaction/' };
  const explorer   = explorers[o.network] || explorers.bsc;

  const txIn  = o.tx_hash_in  ? `<a href="${explorer}${o.tx_hash_in}">${o.tx_hash_in.slice(0,18)}…</a>`  : 'Not yet';
  const txOut = o.tx_hash_out ? `<a href="${explorer}${o.tx_hash_out}">${o.tx_hash_out.slice(0,18)}…</a>` : 'Not yet';

  const msg = [
    `🔍 <b>Order Details</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
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
    `━━━━━━━━━━━━━━━━━━━━`,
  ].filter(l => l !== '').join('\n');

  const btns = [[Markup.button.callback('🔙 Back to Orders', 'orders_list')]];
  if (o.status === 'failed') {
    btns.unshift([Markup.button.callback('🔁 Retry Send', `order_retry_${o.id}`)]);
  }

  await ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(btns) });
}

async function handleOrderRetry(ctx, orderId) {
  const { rows } = await pool.query(`SELECT * FROM orders WHERE id=$1 AND status='failed'`, [orderId]);
  if (!rows.length) return ctx.answerCbQuery('Order is not in failed state.');

  await ctx.answerCbQuery('Retrying…');
  await ctx.reply(`🔁 Retrying token send for order <code>${orderId}</code>…`, { parse_mode: 'HTML' });

  sendTokensWithRetry(rows[0]).then(async result => {
    if (result.success) {
      await ctx.reply(`✅ Retry successful! TX: <code>${result.txHash}</code>`, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(`❌ Retry failed: ${result.error}`);
    }
  }).catch(err => ctx.reply(`❌ Error: ${err.message}`));
}

// ── Helpers ───────────────────────────────────────────────────
function timeSince(date) {
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs/3600)}h ago`;
  return `${Math.floor(secs/86400)}d ago`;
}

function msToCountdown(ms) {
  if (ms <= 0) return 'Expired';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

module.exports = { handleOrders, handleOrderDetail, handleOrderRetry };
