'use strict';
const { Markup } = require('telegraf');
const { pool } = require('../../db');
const { withHomeButton } = require('../middleware/menu');
const { smartEdit } = require('../middleware/smartEdit');

async function handleUnmatched(ctx) {
  const { rows } = await pool.query(
    `SELECT * FROM wallet_transactions WHERE status='unmatched' ORDER BY detected_at DESC LIMIT 20`
  );

  if (!rows.length) {
    return smartEdit(ctx,
      `🔍 <b>Unmatched Transactions</b>\n\n✅ All clear — no unmatched transactions.`,
      { parse_mode: 'HTML', ...withHomeButton([]) }
    );
  }

  const lines = rows.map((t, i) => [
    `<b>#${i + 1}</b>  ${t.network.toUpperCase()} · ${t.coin_symbol}  <i>${timeAgo(t.detected_at)}</i>`,
    `  Amount:  <b>${t.amount}</b>`,
    `  From:    <code>${t.from_address.slice(0, 14)}…</code>`,
  ].join('\n')).join('\n\n');

  const msg = [
    `🔍 <b>Unmatched Transactions (${rows.length})</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    lines,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].join('\n');

  const detailBtns = [];
  for (let i = 0; i < rows.length; i += 2) {
    const row = [Markup.button.callback(`👁  #${i + 1}`, `unmatched_detail_${rows[i].id}`)];
    if (rows[i + 1]) row.push(Markup.button.callback(`👁  #${i + 2}`, `unmatched_detail_${rows[i + 1].id}`));
    detailBtns.push(row);
  }

  await smartEdit(ctx, msg, { parse_mode: 'HTML', ...withHomeButton(detailBtns) });
}

async function handleUnmatchedDetail(ctx, txId) {
  const { rows } = await pool.query(`SELECT * FROM wallet_transactions WHERE id=$1`, [txId]);
  if (!rows.length) { await ctx.answerCbQuery('Transaction not found'); return; }

  const t        = rows[0];
  const explorer = { bsc: 'https://bscscan.com/tx/', eth: 'https://etherscan.io/tx/', tron: 'https://tronscan.org/#/transaction/' };
  const txUrl    = (explorer[t.network] || explorer.bsc) + t.tx_hash;

  const msg = [
    `🔍 <b>Transaction Detail</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Network:   ${t.network.toUpperCase()}`,
    `Coin:      ${t.coin_symbol}`,
    `Amount:    <b>${t.amount}</b>`,
    `From:      <code>${t.from_address}</code>`,
    `TX:        <a href="${txUrl}">${t.tx_hash.slice(0, 18)}…</a>`,
    `Detected:  ${new Date(t.detected_at).toLocaleString()}`,
    ``,
    `❓ No matching order found`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].join('\n');

  await ctx.answerCbQuery();
  await smartEdit(ctx, msg, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔗  Link to Order',  `unmatched_link_${txId}`)],
      [
        Markup.button.callback('✅  Mark Resolved', `unmatched_resolve_${txId}`),
        Markup.button.callback('💸  Mark Refunded', `unmatched_refund_${txId}`),
      ],
      [Markup.button.callback('🔙  Back',      'nav_unmatched')],
      [Markup.button.callback('🏠  Main Menu', 'nav_home')],
    ]),
  });
}

async function handleMarkResolved(ctx, txId) {
  await pool.query(
    `UPDATE wallet_transactions SET status='resolved', resolved_by=$1, resolved_at=NOW() WHERE id=$2`,
    [ctx.from.id, txId]
  );
  await ctx.answerCbQuery('✅ Marked as resolved');
  return handleUnmatched(ctx);
}

async function handleMarkRefunded(ctx, txId) {
  await pool.query(
    `UPDATE wallet_transactions SET status='refund_marked', refund_marked=true, refund_marked_by=$1 WHERE id=$2`,
    [ctx.from.id, txId]
  );
  await ctx.answerCbQuery('💸 Marked as refunded');
  return handleUnmatched(ctx);
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

module.exports = { handleUnmatched, handleUnmatchedDetail, handleMarkResolved, handleMarkRefunded };
