'use strict';
const { Scenes, Markup } = require('telegraf');
const { pool } = require('../../db');
const { sceneEdit, deleteUserMsg } = require('../middleware/sceneHelper');
const { handleAdmins } = require('../handlers/admins');

// ── Add Admin Scene ───────────────────────────────────────────
const addAdminScene = new Scenes.BaseScene('add_admin');

addAdminScene.enter(async ctx => {
  ctx.scene.session.step = 'awaiting_id';
  await sceneEdit(ctx,
    `👥 <b>Add Admin</b>\n\nSend me the Telegram user ID of the new admin.\n\n<i>They can get their ID from @userinfobot</i>`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'aa_cancel')]])
  );
});

addAdminScene.on('text', async ctx => {
  if (ctx.scene.session.step !== 'awaiting_id') return;
  await deleteUserMsg(ctx);

  const id = parseInt(ctx.message.text.trim(), 10);
  if (isNaN(id) || id <= 0) {
    return sceneEdit(ctx,
      `👥 <b>Add Admin</b>\n\n❌ Invalid Telegram user ID. Must be a number.`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'aa_cancel')]])
    );
  }
  if (id === ctx.from.id) {
    return sceneEdit(ctx,
      `👥 <b>Add Admin</b>\n\n❌ You cannot add yourself — you are already an admin.`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'aa_cancel')]])
    );
  }

  const { rows } = await pool.query(`SELECT * FROM admins WHERE telegram_id=$1`, [id]);
  if (rows.length && rows[0].is_active) {
    return sceneEdit(ctx,
      `👥 <b>Add Admin</b>\n\n⚠️ User <code>${id}</code> is already an admin.`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'aa_cancel')]])
    );
  }

  ctx.scene.session.newAdminId = id;
  await sceneEdit(ctx,
    `⚠️ <b>Confirm Add Admin</b>\n\nUser ID: <code>${id}</code>\n\nThis user will have full access to the admin bot.`,
    Markup.inlineKeyboard([[Markup.button.callback('✅ Confirm', 'aa_confirm'), Markup.button.callback('❌ Cancel', 'aa_cancel')]])
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

  // Notify new admin
  try {
    await ctx.telegram.sendMessage(id,
      '👋 <b>You have been added as a Flash Exchange admin.</b>',
      { parse_mode: 'HTML' }
    );
  } catch {}

  ctx.scene.leave();
  await handleAdmins(ctx);
});

addAdminScene.action('aa_cancel', async ctx => {
  await ctx.answerCbQuery('Cancelled');
  ctx.scene.leave();
  await handleAdmins(ctx);
});

// ── Link Transaction Scene ────────────────────────────────────
const linkTransactionScene = new Scenes.BaseScene('link_transaction');

linkTransactionScene.enter(async ctx => {
  ctx.scene.session.step = 'awaiting_order_id';
  await sceneEdit(ctx,
    `🔗 <b>Link Transaction to Order</b>\n\nSend me the Order ID to link this transaction to:`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'lt_cancel')]])
  );
});

linkTransactionScene.on('text', async ctx => {
  if (ctx.scene.session.step !== 'awaiting_order_id') return;
  await deleteUserMsg(ctx);

  const orderId = ctx.message.text.trim();
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return sceneEdit(ctx,
      `🔗 <b>Link Transaction to Order</b>\n\n❌ Invalid order ID format.`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'lt_cancel')]])
    );
  }

  const { rows: orders } = await pool.query(`SELECT * FROM orders WHERE id=$1`, [orderId]);
  if (!orders.length) {
    return sceneEdit(ctx,
      `🔗 <b>Link Transaction to Order</b>\n\n❌ Order not found.`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'lt_cancel')]])
    );
  }

  const order = orders[0];
  const txId  = ctx.scene.session.txId;
  const { rows: txns } = await pool.query(`SELECT * FROM wallet_transactions WHERE id=$1`, [txId]);
  if (!txns.length) {
    return sceneEdit(ctx,
      `🔗 <b>Link Transaction to Order</b>\n\n❌ Transaction not found.`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'lt_cancel')]])
    );
  }

  const txn     = txns[0];
  const amtDiff = parseFloat(txn.amount) - parseFloat(order.unique_crypto_amount);
  const diffStr = amtDiff >= 0 ? `+${amtDiff.toFixed(8)}` : amtDiff.toFixed(8);

  ctx.scene.session.orderId = orderId;
  ctx.scene.session.order   = order;
  ctx.scene.session.txn     = txn;
  ctx.scene.session.step    = 'awaiting_confirm';

  await sceneEdit(ctx,
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
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Yes, Send Tokens', 'lt_confirm')],
      [Markup.button.callback('❌ Cancel', 'lt_cancel')],
    ])
  );
});

linkTransactionScene.action('lt_confirm', async ctx => {
  const { orderId, order, txn } = ctx.scene.session;
  const { sendTokensWithRetry } = require('../../services/token-sender');
  const { handleUnmatched }     = require('../handlers/unmatched');

  await pool.query(
    `UPDATE wallet_transactions SET status='matched', order_id=$1, resolved_by=$2, resolved_at=NOW() WHERE id=$3`,
    [orderId, ctx.from.id, txn.id]
  );
  await pool.query(
    `UPDATE orders SET status='matched', tx_hash_in=$1, matched_at=NOW(), manually_completed_by=$2, updated_at=NOW() WHERE id=$3`,
    [txn.tx_hash, ctx.from.id, orderId]
  );

  await ctx.answerCbQuery('Sending tokens…');
  await sceneEdit(ctx,
    `📤 Sending <b>${Number(order.token_amount).toLocaleString()} FLASH</b> to <code>${order.receiving_wallet}</code>…`,
    {}
  );

  sendTokensWithRetry({ ...order, status: 'matched' }).then(async result => {
    if (result.success) {
      await sceneEdit(ctx, `✅ <b>Tokens sent!</b>\nTX: <code>${result.txHash}</code>`, {});
    } else {
      await sceneEdit(ctx, `❌ Send failed: ${result.error}`, {});
    }
    setTimeout(() => handleUnmatched(ctx).catch(() => {}), 2000);
  }).catch(err => sceneEdit(ctx, `❌ Error: ${err.message}`, {}));

  ctx.scene.leave();
});

linkTransactionScene.action('lt_cancel', async ctx => {
  await ctx.answerCbQuery('Cancelled');
  const { handleUnmatched } = require('../handlers/unmatched');
  ctx.scene.leave();
  await handleUnmatched(ctx);
});

module.exports = { addAdminScene, linkTransactionScene };
