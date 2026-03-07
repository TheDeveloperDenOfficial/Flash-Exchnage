'use strict';
const { Markup } = require('telegraf');
const { getAllSettings } = require('../../db');
const { withHomeButton } = require('../middleware/menu');
const { smartEdit } = require('../middleware/smartEdit');

async function handleSettings(ctx) {
  const s = await getAllSettings();

  const msg = [
    `⚙️ <b>Settings</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `<b>Token</b>`,
    `  Symbol:    ${s.token_symbol || 'FLASH'}`,
    `  Price:     $${s.token_price_usd} per token`,
    `  Min Order: ${s.min_order_qty} tokens`,
    ``,
    `<b>Orders</b>`,
    `  Expiry:    ${s.order_expiry_minutes} minutes`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `<i>Changes apply to new orders only.</i>`,
  ].join('\n');

  const keyboard = withHomeButton([
    [Markup.button.callback('💲  Change Price',    'settings_price')],
    [Markup.button.callback('📦  Min Quantity',    'settings_min_qty')],
    [Markup.button.callback('⏱  Order Expiry',     'settings_expiry')],
  ]);

  await smartEdit(ctx, msg, { parse_mode: 'HTML', ...keyboard });
}

module.exports = { handleSettings };
