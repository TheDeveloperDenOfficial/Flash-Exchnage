'use strict';
const { Markup } = require('telegraf');
const { pool } = require('../../db');

async function handleUnmatched(ctx) {
  const { rows } = await pool.query(
    `SELECT * FROM wallet_transactions WHERE status='unmatched' ORDER BY detected_at DESC LIMIT 20`
  );

  if (!rows.length) {
    return ctx.reply('🔍 No unmatched transactions. All clear! ✅');
  }

  const lines = rows.map((t, i) => [
    `<b>#${i + 1} — ${timeAgo(t.detected_at)}</b>`,
    `  Network: ${t.network.toUpperCase()} | Coin: ${t.coin_symbol}`,
    `  Amount:  <b>${t.amount}</b>`,
    `  From:    <code>${t.from_address.slice(0,14)}…</code>`,
  ].join('\n')).join('\n\n');

  const msg = `🔍 <b>Unmatched Transactions (${rows.length})</b>\n━━━━━━━━━━━━━━━━━━━━\n\n${lines}\n━━━━━━━━━━━━━━━━━━━━`;

  const detailBtns = rows.map((t, i) =>
    [Markup.button.callback(`👁 #${i + 1} Details`, `unmatched_detail_${t.id}`)]
  );

  await ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(detailBtns) });
}

async function handleUnmatchedDetail(ctx, txId) {
  const { rows } = await pool.query(`SELECT * FROM wallet_transactions WHERE id=$1`, [txId]);
  if (!rows.length) return ctx.answerCbQuery('Transaction not found');

  const t         = rows[0];
  const explorers = { bsc: 'https://bscscan.com/tx/', eth: 'https://etherscan.io/tx/', tron: 'https://tronscan.org/#/transaction/' };
  const txUrl     = (explorers[t.network] || explorers.bsc) + t.tx_hash;

  const msg = [
    `🔍 <b>Transaction Details</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Network:   ${t.network.toUpperCase()}`,
    `Coin:      ${t.coin_symbol}`,
    `Amount:    <b>${t.amount}</b>`,
    `From:      <code>${t.from_address}</code>`,
    `TX:        <a href="${txUrl}">${t.tx_hash.slice(0,18)}…</a>`,
    `Detected:  ${new Date(t.detected_at).toLocaleString()}`,
    ``,
    `❌ No matching order found`,
    `━━━━━━━━━━━━━━━━━━━━`,
  ].join('\n');

  await ctx.answerCbQuery();
  await ctx.reply(msg, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔗 Link to Order',   `unmatched_link_${txId}`)],
      [Markup.button.callback('✅ Mark Resolved',   `unmatched_resolve_${txId}`)],
      [Markup.button.callback('💸 Mark Refunded',   `unmatched_refund_${txId}`)],
      [Markup.button.callback('🔙 Back',            'unmatched_list')],
    ]),
  });
}

async function handleMarkResolved(ctx, txId) {
  await pool.query(
    `UPDATE wallet_transactions SET status='resolved', resolved_by=$1, resolved_at=NOW() WHERE id=$2`,
    [ctx.from.id, txId]
  );
  await ctx.answerCbQuery('✅ Marked as resolved');
  await ctx.reply('Transaction marked as resolved. You can add a note by replying to this message.');
}

async function handleMarkRefunded(ctx, txId) {
  await pool.query(
    `UPDATE wallet_transactions SET status='refund_marked', refund_marked=true, refund_marked_by=$1 WHERE id=$2`,
    [ctx.from.id, txId]
  );
  await ctx.answerCbQuery('💸 Marked as refunded');
  await ctx.reply('Transaction marked as refunded (manual refund via external wallet).');
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

module.exports = { handleUnmatched, handleUnmatchedDetail, handleMarkResolved, handleMarkRefunded };
