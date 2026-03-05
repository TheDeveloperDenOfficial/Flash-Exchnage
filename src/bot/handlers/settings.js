'use strict';
const { Markup } = require('telegraf');
const { getAllSettings } = require('../../db');

async function handleSettings(ctx) {
  const s = await getAllSettings();

  const msg = [
    `⚙️ <b>Settings</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `<b>Token</b>`,
    `  Symbol:   ${s.token_symbol || 'FLASH'}`,
    `  Price:    $${s.token_price_usd} per token`,
    `  Min Order: ${s.min_order_qty} tokens`,
    ``,
    `<b>Orders</b>`,
    `  Expiry:   ${s.order_expiry_minutes} minutes`,
    `━━━━━━━━━━━━━━━━━━━━`,
  ].join('\n');

  await ctx.reply(msg, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('💲 Change Price',    'settings_price')],
      [Markup.button.callback('📦 Min Quantity',    'settings_min_qty')],
      [Markup.button.callback('⏱ Order Expiry',     'settings_expiry')],
    ]),
  });
}

module.exports = { handleSettings };
