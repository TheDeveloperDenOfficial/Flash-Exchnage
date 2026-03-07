'use strict';
const { Scenes, Markup } = require('telegraf');
const { getSetting, setSetting } = require('../../db');
const { sceneEdit, deleteUserMsg } = require('../middleware/sceneHelper');
const { handleSettings } = require('../handlers/settings');

// ── Change Price Scene ────────────────────────────────────────
const changePriceScene = new Scenes.BaseScene('change_price');

changePriceScene.enter(async ctx => {
  const current = await getSetting('token_price_usd');
  ctx.scene.session.step = 'awaiting_price';
  await sceneEdit(ctx,
    `💲 <b>Change Token Price</b>\n\nCurrent price: <b>$${current}</b> per token\n\nSend me the new price in USD.\n<i>Example: 0.05</i>`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'sp_cancel')]])
  );
});

changePriceScene.on('text', async ctx => {
  if (ctx.scene.session.step !== 'awaiting_price') return;
  await deleteUserMsg(ctx);
  const val = parseFloat(ctx.message.text.trim());
  if (isNaN(val) || val <= 0) {
    return sceneEdit(ctx,
      `💲 <b>Change Token Price</b>\n\n❌ Invalid price. Enter a positive number like <i>0.05</i>`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'sp_cancel')]])
    );
  }
  ctx.scene.session.newPrice = val;
  const current = await getSetting('token_price_usd');
  await sceneEdit(ctx,
    `⚠️ <b>Confirm Price Change</b>\n\nOld price: $${current}\nNew price: <b>$${val}</b>\n\nAll NEW orders will use this price.\nActive pending orders are unaffected.`,
    Markup.inlineKeyboard([[Markup.button.callback('✅ Confirm', 'sp_confirm'), Markup.button.callback('❌ Cancel', 'sp_cancel')]])
  );
});

changePriceScene.action('sp_confirm', async ctx => {
  await setSetting('token_price_usd', ctx.scene.session.newPrice, ctx.from.id);
  await ctx.answerCbQuery('✅ Price updated');
  ctx.scene.leave();
  await handleSettings(ctx);
});

changePriceScene.action('sp_cancel', async ctx => {
  await ctx.answerCbQuery('Cancelled');
  ctx.scene.leave();
  await handleSettings(ctx);
});

// ── Change Min Qty Scene ──────────────────────────────────────
const changeMinQtyScene = new Scenes.BaseScene('change_min_qty');

changeMinQtyScene.enter(async ctx => {
  const current = await getSetting('min_order_qty');
  ctx.scene.session.step = 'awaiting_qty';
  await sceneEdit(ctx,
    `📦 <b>Change Minimum Quantity</b>\n\nCurrent minimum: <b>${current} tokens</b>\n\nSend me the new minimum.\n<i>Example: 500</i>`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'sq_cancel')]])
  );
});

changeMinQtyScene.on('text', async ctx => {
  if (ctx.scene.session.step !== 'awaiting_qty') return;
  await deleteUserMsg(ctx);
  const val = parseInt(ctx.message.text.trim(), 10);
  if (isNaN(val) || val < 1) {
    return sceneEdit(ctx,
      `📦 <b>Change Minimum Quantity</b>\n\n❌ Invalid quantity. Enter a positive whole number.`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'sq_cancel')]])
    );
  }
  ctx.scene.session.newQty = val;
  const current = await getSetting('min_order_qty');
  await sceneEdit(ctx,
    `⚠️ <b>Confirm Minimum Change</b>\n\nOld minimum: ${current} tokens\nNew minimum: <b>${val} tokens</b>`,
    Markup.inlineKeyboard([[Markup.button.callback('✅ Confirm', 'sq_confirm'), Markup.button.callback('❌ Cancel', 'sq_cancel')]])
  );
});

changeMinQtyScene.action('sq_confirm', async ctx => {
  await setSetting('min_order_qty', ctx.scene.session.newQty, ctx.from.id);
  await ctx.answerCbQuery('✅ Minimum updated');
  ctx.scene.leave();
  await handleSettings(ctx);
});

changeMinQtyScene.action('sq_cancel', async ctx => {
  await ctx.answerCbQuery('Cancelled');
  ctx.scene.leave();
  await handleSettings(ctx);
});

// ── Change Expiry Scene ───────────────────────────────────────
const changeExpiryScene = new Scenes.BaseScene('change_expiry');

changeExpiryScene.enter(async ctx => {
  const current = await getSetting('order_expiry_minutes');
  ctx.scene.session.step = 'awaiting_expiry';
  await sceneEdit(ctx,
    `⏱ <b>Change Order Expiry</b>\n\nCurrent expiry: <b>${current} minutes</b>\n\nSend me the new expiry time in minutes.\n<i>Example: 60</i>`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'se_cancel')]])
  );
});

changeExpiryScene.on('text', async ctx => {
  if (ctx.scene.session.step !== 'awaiting_expiry') return;
  await deleteUserMsg(ctx);
  const val = parseInt(ctx.message.text.trim(), 10);
  if (isNaN(val) || val < 5) {
    return sceneEdit(ctx,
      `⏱ <b>Change Order Expiry</b>\n\n❌ Minimum expiry is 5 minutes.`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'se_cancel')]])
    );
  }
  ctx.scene.session.newExpiry = val;
  const current = await getSetting('order_expiry_minutes');
  await sceneEdit(ctx,
    `⚠️ <b>Confirm Expiry Change</b>\n\nOld expiry: ${current} minutes\nNew expiry: <b>${val} minutes</b>\n\nApplies to NEW orders only.`,
    Markup.inlineKeyboard([[Markup.button.callback('✅ Confirm', 'se_confirm'), Markup.button.callback('❌ Cancel', 'se_cancel')]])
  );
});

changeExpiryScene.action('se_confirm', async ctx => {
  await setSetting('order_expiry_minutes', ctx.scene.session.newExpiry, ctx.from.id);
  await ctx.answerCbQuery('✅ Expiry updated');
  ctx.scene.leave();
  await handleSettings(ctx);
});

changeExpiryScene.action('se_cancel', async ctx => {
  await ctx.answerCbQuery('Cancelled');
  ctx.scene.leave();
  await handleSettings(ctx);
});

// ── Change Marquee Text Scene ─────────────────────────────────
const changeMarqueeScene = new Scenes.BaseScene('change_marquee');

changeMarqueeScene.enter(async ctx => {
  const current = await getSetting('marquee_text');
  ctx.scene.session.step = 'awaiting_marquee';
  await sceneEdit(ctx,
    `📢 <b>Change Marquee Text</b>\n\nCurrent message:\n<i>${current ? current : 'Not set'}</i>\n\nSend the new announcement text.\nSend <code>clear</code> to hide the marquee.`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'sm_cancel')]])
  );
});

changeMarqueeScene.on('text', async ctx => {
  if (ctx.scene.session.step !== 'awaiting_marquee') return;
  await deleteUserMsg(ctx);
  const val = ctx.message.text.trim();
  const newText = val.toLowerCase() === 'clear' ? '' : val;
  ctx.scene.session.newMarquee = newText;
  const preview = newText || '<i>(hidden — marquee cleared)</i>';
  await sceneEdit(ctx,
    `⚠️ <b>Confirm Marquee Update</b>\n\nNew message:\n${preview}`,
    Markup.inlineKeyboard([[Markup.button.callback('✅ Confirm', 'sm_confirm'), Markup.button.callback('❌ Cancel', 'sm_cancel')]])
  );
});

changeMarqueeScene.action('sm_confirm', async ctx => {
  await setSetting('marquee_text', ctx.scene.session.newMarquee, ctx.from.id);
  await ctx.answerCbQuery('✅ Marquee updated');
  ctx.scene.leave();
  await handleSettings(ctx);
});

changeMarqueeScene.action('sm_cancel', async ctx => {
  await ctx.answerCbQuery('Cancelled');
  ctx.scene.leave();
  await handleSettings(ctx);
});

module.exports = { changePriceScene, changeMinQtyScene, changeExpiryScene, changeMarqueeScene };
