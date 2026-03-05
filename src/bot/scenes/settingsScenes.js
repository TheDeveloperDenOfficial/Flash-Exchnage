'use strict';
const { Scenes, Markup } = require('telegraf');
const { getSetting, setSetting } = require('../../db');

// ── Change Price Scene ────────────────────────────────────────
const changePriceScene = new Scenes.BaseScene('change_price');

changePriceScene.enter(async ctx => {
  const current = await getSetting('token_price_usd');
  ctx.scene.session.step = 'awaiting_price';
  await ctx.reply(
    `💲 <b>Change Token Price</b>\n\nCurrent price: <b>$${current}</b> per token\n\nSend me the new price in USD.\n<i>Example: 0.05</i>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'sp_cancel')]]) }
  );
});

changePriceScene.on('text', async ctx => {
  if (ctx.scene.session.step !== 'awaiting_price') return;
  const val = parseFloat(ctx.message.text.trim());
  if (isNaN(val) || val <= 0) return ctx.reply('❌ Invalid price. Enter a positive number like 0.05');

  ctx.scene.session.newPrice = val;
  const current = await getSetting('token_price_usd');

  await ctx.reply(
    `⚠️ <b>Confirm Price Change</b>\n\nOld price: $${current}\nNew price: <b>$${val}</b>\n\nAll NEW orders will use this price.\nActive pending orders are unaffected.`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Confirm', 'sp_confirm'), Markup.button.callback('❌ Cancel', 'sp_cancel')]]) }
  );
});

changePriceScene.action('sp_confirm', async ctx => {
  await setSetting('token_price_usd', ctx.scene.session.newPrice, ctx.from.id);
  await ctx.answerCbQuery('✅ Price updated');
  await ctx.reply(`✅ Token price updated to <b>$${ctx.scene.session.newPrice}</b>`, { parse_mode: 'HTML' });
  ctx.scene.leave();
});

changePriceScene.action('sp_cancel', async ctx => {
  await ctx.answerCbQuery('Cancelled');
  await ctx.reply('Cancelled.');
  ctx.scene.leave();
});

// ── Change Min Qty Scene ──────────────────────────────────────
const changeMinQtyScene = new Scenes.BaseScene('change_min_qty');

changeMinQtyScene.enter(async ctx => {
  const current = await getSetting('min_order_qty');
  ctx.scene.session.step = 'awaiting_qty';
  await ctx.reply(
    `📦 <b>Change Minimum Quantity</b>\n\nCurrent minimum: <b>${current} tokens</b>\n\nSend me the new minimum.\n<i>Example: 500</i>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'sq_cancel')]]) }
  );
});

changeMinQtyScene.on('text', async ctx => {
  if (ctx.scene.session.step !== 'awaiting_qty') return;
  const val = parseInt(ctx.message.text.trim(), 10);
  if (isNaN(val) || val < 1) return ctx.reply('❌ Invalid quantity. Enter a positive whole number.');

  ctx.scene.session.newQty = val;
  const current = await getSetting('min_order_qty');

  await ctx.reply(
    `⚠️ <b>Confirm Minimum Change</b>\n\nOld minimum: ${current} tokens\nNew minimum: <b>${val} tokens</b>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Confirm', 'sq_confirm'), Markup.button.callback('❌ Cancel', 'sq_cancel')]]) }
  );
});

changeMinQtyScene.action('sq_confirm', async ctx => {
  await setSetting('min_order_qty', ctx.scene.session.newQty, ctx.from.id);
  await ctx.answerCbQuery('✅ Minimum updated');
  await ctx.reply(`✅ Minimum order quantity updated to <b>${ctx.scene.session.newQty} tokens</b>`, { parse_mode: 'HTML' });
  ctx.scene.leave();
});

changeMinQtyScene.action('sq_cancel', async ctx => {
  await ctx.answerCbQuery('Cancelled');
  await ctx.reply('Cancelled.');
  ctx.scene.leave();
});

// ── Change Expiry Scene ───────────────────────────────────────
const changeExpiryScene = new Scenes.BaseScene('change_expiry');

changeExpiryScene.enter(async ctx => {
  const current = await getSetting('order_expiry_minutes');
  ctx.scene.session.step = 'awaiting_expiry';
  await ctx.reply(
    `⏱ <b>Change Order Expiry</b>\n\nCurrent expiry: <b>${current} minutes</b>\n\nSend me the new expiry time in minutes.\n<i>Example: 60</i>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'se_cancel')]]) }
  );
});

changeExpiryScene.on('text', async ctx => {
  if (ctx.scene.session.step !== 'awaiting_expiry') return;
  const val = parseInt(ctx.message.text.trim(), 10);
  if (isNaN(val) || val < 5) return ctx.reply('❌ Minimum expiry is 5 minutes.');

  ctx.scene.session.newExpiry = val;
  const current = await getSetting('order_expiry_minutes');

  await ctx.reply(
    `⚠️ <b>Confirm Expiry Change</b>\n\nOld expiry: ${current} minutes\nNew expiry: <b>${val} minutes</b>\n\nApplies to NEW orders only.`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Confirm', 'se_confirm'), Markup.button.callback('❌ Cancel', 'se_cancel')]]) }
  );
});

changeExpiryScene.action('se_confirm', async ctx => {
  await setSetting('order_expiry_minutes', ctx.scene.session.newExpiry, ctx.from.id);
  await ctx.answerCbQuery('✅ Expiry updated');
  await ctx.reply(`✅ Order expiry updated to <b>${ctx.scene.session.newExpiry} minutes</b>`, { parse_mode: 'HTML' });
  ctx.scene.leave();
});

changeExpiryScene.action('se_cancel', async ctx => {
  await ctx.answerCbQuery('Cancelled');
  await ctx.reply('Cancelled.');
  ctx.scene.leave();
});

module.exports = { changePriceScene, changeMinQtyScene, changeExpiryScene };
