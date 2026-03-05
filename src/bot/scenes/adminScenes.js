'use strict';
const { Scenes, Markup } = require('telegraf');
const { pool } = require('../../db');

// ── Add Admin Scene ───────────────────────────────────────────
const addAdminScene = new Scenes.BaseScene('add_admin');

addAdminScene.enter(async ctx => {
  ctx.scene.session.step = 'awaiting_id';
  await ctx.reply(
    `👥 <b>Add Admin</b>\n\nSend me the Telegram user ID of the new admin.\n\n<i>They can get their ID from @userinfobot</i>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'aa_cancel')]]) }
  );
});

addAdminScene.on('text', async ctx => {
  if (ctx.scene.session.step !== 'awaiting_id') return;

  const id = parseInt(ctx.message.text.trim(), 10);
  if (isNaN(id) || id <= 0) return ctx.reply('❌ Invalid Telegram user ID. Must be a number.');
  if (id === ctx.from.id)   return ctx.reply('❌ You cannot add yourself — you are already an admin.');

  // Check if already exists
  const { rows } = await pool.query(`SELECT * FROM admins WHERE telegram_id=$1`, [id]);
  if (rows.length && rows[0].is_active) return ctx.reply('⚠️ This user is already an admin.');

  ctx.scene.session.newAdminId = id;

  await ctx.reply(
    `⚠️ <b>Confirm Add Admin</b>\n\nUser ID: <code>${id}</code>\n\nThis user will have full access to the admin bot.`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Confirm', 'aa_confirm'), Markup.button.callback('❌ Cancel', 'aa_cancel')]]) }
  );
});

addAdminScene.action('aa_confirm', async ctx => {
  const id = ctx.scene.session.newAdminId;

  await pool.query(
    `INSERT INTO admins (telegram_id, is_active, added_by)
     VALUES ($1, true, $2)
     ON CONFLICT (telegram_id) DO UPDATE SET is_active=true, added_by=$2`,
    [id, ctx.from.id]
  );

  await ctx.answerCbQuery('✅ Admin added');
  await ctx.reply(`✅ Admin <code>${id}</code> added successfully.`, { parse_mode: 'HTML' });

  // Notify new admin
  try {
    await ctx.telegram.sendMessage(id,
      '👋 <b>You have been added as a Flash Exchange admin.</b>\n\nType /start to begin.',
      { parse_mode: 'HTML' }
    );
  } catch {}

  ctx.scene.leave();
});

addAdminScene.action('aa_cancel', async ctx => {
  await ctx.answerCbQuery('Cancelled');
  await ctx.reply('Cancelled.');
  ctx.scene.leave();
});

// ── Link Transaction Scene ────────────────────────────────────
const linkTransactionScene = new Scenes.BaseScene('link_transaction');

linkTransactionScene.enter(async ctx => {
  ctx.scene.session.step = 'awaiting_order_id';
  await ctx.reply(
    `🔗 <b>Link Transaction to Order</b>\n\nSend me the Order ID to link this transaction to:`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'lt_cancel')]]) }
  );
});

linkTransactionScene.on('text', async ctx => {
  const step = ctx.scene.session.step;

  if (step === 'awaiting_order_id') {
    const orderId = ctx.message.text.trim();
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return ctx.reply('❌ Invalid order ID format.');

    const { rows: orders } = await pool.query(`SELECT * FROM orders WHERE id=$1`, [orderId]);
    if (!orders.length) return ctx.reply('❌ Order not found.');

    const order = orders[0];
    const txId  = ctx.scene.session.txId;

    const { rows: txns } = await pool.query(`SELECT * FROM wallet_transactions WHERE id=$1`, [txId]);
    if (!txns.length) return ctx.reply('❌ Transaction not found.');

    const txn = txns[0];
    ctx.scene.session.orderId = orderId;
    ctx.scene.session.order   = order;
    ctx.scene.session.txn     = txn;

    const amtDiff = parseFloat(txn.amount) - parseFloat(order.unique_crypto_amount);
    const diffStr = amtDiff >= 0 ? `+${amtDiff.toFixed(8)}` : amtDiff.toFixed(8);

    await ctx.reply(
      [
        `⚠️ <b>Confirm Manual Link</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `<b>Transaction</b>`,
        `  Amount: ${txn.amount} ${txn.coin_symbol}`,
        `  From:   <code>${txn.from_address}</code>`,
        ``,
        `<b>Order</b>`,
        `  ID:      <code>${order.id}</code>`,
        `  Expects: ${order.unique_crypto_amount} ${order.coin_symbol}`,
        `  Tokens:  ${Number(order.token_amount).toLocaleString()} FLASH`,
        `  Wallet:  <code>${order.receiving_wallet}</code>`,
        ``,
        `Amount diff: <b>${diffStr} ${txn.coin_symbol}</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `Send tokens anyway?`,
      ].join('\n'),
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Yes, Send Tokens', 'lt_confirm')],
          [Markup.button.callback('❌ Cancel',           'lt_cancel')],
        ]),
      }
    );
    ctx.scene.session.step = 'awaiting_confirm';
  }
});

linkTransactionScene.action('lt_confirm', async ctx => {
  const { orderId, order, txn } = ctx.scene.session;
  const { sendTokensWithRetry } = require('../../services/token-sender');

  // Link transaction
  await pool.query(
    `UPDATE wallet_transactions SET status='matched', order_id=$1, resolved_by=$2, resolved_at=NOW() WHERE id=$3`,
    [orderId, ctx.from.id, txn.id]
  );

  // Update order status
  await pool.query(
    `UPDATE orders SET status='matched', tx_hash_in=$1, matched_at=NOW(), manually_completed_by=$2, updated_at=NOW() WHERE id=$3`,
    [txn.tx_hash, ctx.from.id, orderId]
  );

  await ctx.answerCbQuery('Sending tokens…');
  await ctx.reply(`📤 Sending ${Number(order.token_amount).toLocaleString()} FLASH to <code>${order.receiving_wallet}</code>…`, { parse_mode: 'HTML' });

  sendTokensWithRetry({ ...order, status: 'matched' }).then(result => {
    if (result.success) {
      ctx.reply(`✅ Tokens sent! TX: <code>${result.txHash}</code>`, { parse_mode: 'HTML' });
    } else {
      ctx.reply(`❌ Send failed: ${result.error}`);
    }
  }).catch(err => ctx.reply(`❌ Error: ${err.message}`));

  ctx.scene.leave();
});

linkTransactionScene.action('lt_cancel', async ctx => {
  await ctx.answerCbQuery('Cancelled');
  await ctx.reply('Cancelled.');
  ctx.scene.leave();
});

module.exports = { addAdminScene, linkTransactionScene };
