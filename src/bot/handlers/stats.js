'use strict';
const { Markup } = require('telegraf');
const { pool } = require('../../db');
const { checkBalances } = require('../../services/token-sender');
const { MAIN_MENU } = require('../middleware/menu');

async function handleStats(ctx) {
  await ctx.reply('📊 Loading stats…');

  try {
    // Today's revenue
    const { rows: today } = await pool.query(`
      SELECT
        COALESCE(SUM(usdt_amount), 0)  AS usd,
        COALESCE(COUNT(*), 0)          AS orders
      FROM orders
      WHERE status='completed' AND completed_at >= CURRENT_DATE
    `);

    // All-time revenue
    const { rows: allTime } = await pool.query(`
      SELECT
        COALESCE(SUM(usdt_amount), 0)  AS usd,
        COALESCE(SUM(token_amount), 0) AS tokens,
        COALESCE(COUNT(*), 0)          AS orders
      FROM orders WHERE status='completed'
    `);

    // Order breakdown
    const { rows: breakdown } = await pool.query(`
      SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status
    `);

    // Revenue by coin
    const { rows: byCoin } = await pool.query(`
      SELECT coin_symbol, network,
             SUM(usdt_amount)  AS usd,
             SUM(crypto_amount) AS crypto_total
      FROM orders
      WHERE status='completed'
      GROUP BY coin_symbol, network
      ORDER BY usd DESC
    `);

    // Unmatched count
    const { rows: unmatched } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM wallet_transactions WHERE status='unmatched'`
    );

    // Distribution wallet balances
    const balances = await checkBalances();

    const statusMap = { completed: '✅', waiting_payment: '⏳', failed: '❌', expired: '⏰', matched: '🔍', sending: '📤', manually_completed: '🛠' };
    const breakdownLines = breakdown.map(r => `  ${statusMap[r.status] || '•'} ${r.status}: ${r.cnt}`).join('\n');

    const coinLines = byCoin.length
      ? byCoin.map(r => `  ${r.coin_symbol} (${r.network.toUpperCase()}): $${parseFloat(r.usd).toFixed(2)}`).join('\n')
      : '  No completed sales yet';

    const balLine = balances
      ? `  ${balances.nativeSym}: ${balances.native.toFixed(4)}\n  FLASH: ${balances.tokenBal.toLocaleString()}`
      : '  Unable to fetch';

    const msg = [
      `📊 <b>Flash Exchange Stats</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `<b>Today</b>`,
      `  Orders:  ${today[0].orders}`,
      `  Revenue: $${parseFloat(today[0].usd).toFixed(2)} USD`,
      ``,
      `<b>All Time</b>`,
      `  Orders:      ${allTime[0].orders}`,
      `  Revenue:     $${parseFloat(allTime[0].usd).toFixed(2)} USD`,
      `  Tokens Sold: ${parseFloat(allTime[0].tokens).toLocaleString()} FLASH`,
      ``,
      `<b>Revenue by Coin</b>`,
      coinLines,
      ``,
      `<b>Order Breakdown</b>`,
      breakdownLines || '  No orders yet',
      ``,
      `<b>⚠️ Unmatched TXs:</b> ${unmatched[0].cnt}`,
      ``,
      `<b>💰 Distribution Wallet</b>`,
      balLine,
      `━━━━━━━━━━━━━━━━━━━━`,
    ].join('\n');

    await ctx.reply(msg, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh', 'stats_refresh')],
        [Markup.button.callback('📋 View Orders', 'orders_list')],
      ]),
    });

  } catch (err) {
    await ctx.reply(`❌ Error loading stats: ${err.message}`);
  }
}

module.exports = { handleStats };
