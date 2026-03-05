'use strict';
const { Markup } = require('telegraf');
const { pool } = require('../../db');
const { withHomeButton } = require('../middleware/menu');

async function handleWallets(ctx) {
  const { rows } = await pool.query(
    `SELECT pw.*, pm.name AS method_name,
            (SELECT COUNT(*) FROM orders o WHERE o.payment_address=pw.address AND o.status='completed') AS completed_count
     FROM payment_wallets pw
     JOIN payment_methods pm ON pw.payment_method_code = pm.code
     ORDER BY pm.name ASC`
  );

  if (!rows.length) {
    const msg      = `💰 <b>Payment Wallets</b>\n\nNo wallets configured yet.\nAdd your first wallet to start accepting payments.`;
    const keyboard = withHomeButton([[Markup.button.callback('➕  Add Wallet', 'wallet_add')]]);
    if (ctx.callbackQuery) {
      return ctx.editMessageText(msg, { parse_mode: 'HTML', ...keyboard }).catch(() =>
        ctx.reply(msg, { parse_mode: 'HTML', ...keyboard })
      );
    }
    return ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
  }

  const lines = rows.map((w, i) => {
    const status = w.is_active ? '✅ Active' : '🔴 Disabled';
    return [
      `<b>${i + 1}. ${w.method_name}</b>  ${status}`,
      `   <code>${w.address.slice(0, 12)}…${w.address.slice(-8)}</code>`,
      `   ${w.completed_count} completed order(s)`,
    ].join('\n');
  }).join('\n\n');

  const msg = [`💰 <b>Payment Wallets</b>`, `━━━━━━━━━━━━━━━━━━━━━━━━`, ``, lines, ``, `━━━━━━━━━━━━━━━━━━━━━━━━`].join('\n');

  // Per-wallet action rows
  const walletRows = rows.map((w, i) => [
    Markup.button.callback(w.is_active ? '⏸' : '▶️', `wallet_toggle_${w.id}`),
    Markup.button.callback(`📱  QR #${i + 1}`,        `wallet_qr_${w.id}`),
    Markup.button.callback(`🗑  #${i + 1}`,           `wallet_delete_${w.id}`),
  ]);

  const keyboard = withHomeButton([
    [
      Markup.button.callback('➕  Add Wallet', 'wallet_add'),
      Markup.button.callback('🔄  Refresh',    'nav_wallets'),
    ],
    ...walletRows,
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { parse_mode: 'HTML', ...keyboard }).catch(() =>
      ctx.reply(msg, { parse_mode: 'HTML', ...keyboard })
    );
  } else {
    await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
  }
}

async function handleWalletToggle(ctx, walletId) {
  const { rows } = await pool.query(`SELECT * FROM payment_wallets WHERE id=$1`, [walletId]);
  if (!rows.length) return ctx.answerCbQuery('Wallet not found');

  const newState = !rows[0].is_active;
  await pool.query(`UPDATE payment_wallets SET is_active=$1 WHERE id=$2`, [newState, walletId]);
  await ctx.answerCbQuery(newState ? '✅ Wallet enabled' : '🔴 Wallet disabled');
  return handleWallets(ctx);
}

async function handleWalletQR(ctx, walletId) {
  const { rows } = await pool.query(
    `SELECT pw.*, pm.name FROM payment_wallets pw JOIN payment_methods pm ON pw.payment_method_code=pm.code WHERE pw.id=$1`,
    [walletId]
  );
  if (!rows.length) return ctx.answerCbQuery('Wallet not found');

  const { generateQR } = require('../../utils/qr');
  const qrBuffer = await generateQR(rows[0].address);
  await ctx.replyWithPhoto(
    { source: qrBuffer },
    { caption: `📱 <b>${rows[0].name}</b>\n<code>${rows[0].address}</code>`, parse_mode: 'HTML' }
  );
  await ctx.answerCbQuery();
}

async function handleWalletDelete(ctx, walletId) {
  const { rows } = await pool.query(
    `SELECT pw.*, pm.name FROM payment_wallets pw JOIN payment_methods pm ON pw.payment_method_code=pm.code WHERE pw.id=$1`,
    [walletId]
  );
  if (!rows.length) return ctx.answerCbQuery('Wallet not found');

  const wallet = rows[0];
  const { rows: pending } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM orders WHERE payment_address=$1 AND status='waiting_payment'`,
    [wallet.address]
  );

  if (parseInt(pending[0].cnt, 10) > 0) {
    await ctx.answerCbQuery('🚫 Pending orders exist');
    const msg = `🚫 <b>Cannot Delete Wallet</b>\n\nThis wallet has <b>${pending[0].cnt} pending order(s)</b>.\nWait for them to complete or expire first.`;
    return ctx.reply(msg, {
      parse_mode: 'HTML',
      ...withHomeButton([[Markup.button.callback('📋  View Pending Orders', 'nav_orders')]]),
    });
  }

  await ctx.answerCbQuery();
  await ctx.reply(
    `⚠️ <b>Confirm Delete</b>\n\n${wallet.method_name}\n<code>${wallet.address}</code>\n\nThis action cannot be undone.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅  Yes, Delete', `wallet_confirm_delete_${walletId}`)],
        [Markup.button.callback('❌  Cancel',       'nav_wallets')],
      ]),
    }
  );
}

async function handleWalletConfirmDelete(ctx, walletId) {
  await pool.query(`DELETE FROM payment_wallets WHERE id=$1`, [walletId]);
  await ctx.answerCbQuery('🗑 Wallet deleted');
  return handleWallets(ctx);
}

module.exports = { handleWallets, handleWalletToggle, handleWalletQR, handleWalletDelete, handleWalletConfirmDelete };
