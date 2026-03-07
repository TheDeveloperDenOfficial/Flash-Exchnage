'use strict';
const { Markup } = require('telegraf');
const { pool } = require('../../db');
const { checkBalances } = require('../../services/token-sender');
const { withHomeButton } = require('../middleware/menu');
const { smartEdit } = require('../middleware/smartEdit');

async function handleStats(ctx) {
  try {
    const [{ rows: today }, { rows: allTime }, { rows: breakdown }, { rows: byCoin }, { rows: unmatched }] =
      await Promise.all([
        pool.query(`SELECT COALESCE(SUM(usdt_amount),0) AS usd, COALESCE(COUNT(*),0) AS orders
                    FROM orders WHERE status='completed' AND completed_at >= CURRENT_DATE`),
        pool.query(`SELECT COALESCE(SUM(usdt_amount),0) AS usd, COALESCE(SUM(token_amount),0) AS tokens,
                           COALESCE(COUNT(*),0) AS orders FROM orders WHERE status='completed'`),
        pool.query(`SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status`),
        pool.query(`SELECT coin_symbol, network, SUM(usdt_amount) AS usd
                    FROM orders WHERE status='completed'
                    GROUP BY coin_symbol, network ORDER BY usd DESC`),
        pool.query(`SELECT COUNT(*) AS cnt FROM wallet_transactions WHERE status='unmatched'`),
      ]);

    const balances = await checkBalances().catch(() => null);

    const STATUS_EMOJI = { completed:'✅', waiting_payment:'⏳', failed:'❌', expired:'⏰', matched:'🔍', sending:'📤', manually_completed:'🛠' };
    const breakdownLines = breakdown.length
      ? breakdown.map(r => `  ${STATUS_EMOJI[r.status] || '•'} ${r.status}: ${r.cnt}`).join('\n')
      : '  No orders yet';

    const coinLines = byCoin.length
      ? byCoin.map(r => `  ${r.coin_symbol} (${r.network.toUpperCase()}): $${parseFloat(r.usd).toFixed(2)}`).join('\n')
      : '  No completed sales yet';

    const balLine = balances
      ? `  ${balances.nativeSym}: ${balances.native.toFixed(4)}\n  FLASH: ${Number(balances.tokenBal).toLocaleString()}`
      : '  Unable to fetch';

    const unmatchedCount = parseInt(unmatched[0].cnt, 10);
    const unmatchedLine  = unmatchedCount > 0
      ? `⚠️ <b>Unmatched TXs:</b> ${unmatchedCount} — requires attention`
      : `✅ <b>Unmatched TXs:</b> None`;

    const msg = [
      `📊 <b>Flash Exchange — Statistics</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `<b>📅 Today</b>`,
      `  Orders:   ${today[0].orders}`,
      `  Revenue:  $${parseFloat(today[0].usd).toFixed(2)} USD`,
      ``,
      `<b>📈 All Time</b>`,
      `  Orders:       ${allTime[0].orders}`,
      `  Revenue:      $${parseFloat(allTime[0].usd).toFixed(2)} USD`,
      `  Tokens Sold:  ${parseFloat(allTime[0].tokens).toLocaleString()} FLASH`,
      ``,
      `<b>💳 Revenue by Coin</b>`,
      coinLines,
      ``,
      `<b>📦 Order Breakdown</b>`,
      breakdownLines,
      ``,
      unmatchedLine,
      ``,
      `<b>💰 Distribution Wallet</b>`,
      balLine,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
    ].join('\n');

    const keyboard = withHomeButton([
      [
        Markup.button.callback('🔄  Refresh',     'nav_stats'),
        Markup.button.callback('📋  View Orders', 'nav_orders'),
      ],
    ]);

    await smartEdit(ctx, msg, { parse_mode: 'HTML', ...keyboard });

  } catch (err) {
    await smartEdit(ctx, `❌ Error loading stats: ${err.message}`);
  }
}

module.exports = { handleStats };
