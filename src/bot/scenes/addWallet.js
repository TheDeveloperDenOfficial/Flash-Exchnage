'use strict';
const { Scenes, Markup } = require('telegraf');
const { pool } = require('../../db');
const { validateBep20Wallet, isValidTronAddress } = require('../../utils/validators');
const { sceneEdit, deleteUserMsg } = require('../middleware/sceneHelper');
const { handleWallets } = require('../handlers/wallets');

const scene = new Scenes.BaseScene('add_wallet');

scene.enter(async ctx => {
  ctx.scene.session.data = {};
  await sceneEdit(ctx,
    `💰 <b>Add Payment Wallet</b>\n\nStep 1 of 3 — Select network:`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🔶 BSC',  'aw_net_bsc')],
      [Markup.button.callback('💎 ETH',  'aw_net_eth')],
      [Markup.button.callback('🔴 TRON', 'aw_net_tron')],
      [Markup.button.callback('❌ Cancel', 'aw_cancel')],
    ])
  );
});

// Step 1 — Network selected
scene.action(/^aw_net_(.+)$/, async ctx => {
  const network = ctx.match[1];
  ctx.scene.session.data.network = network;

  const coinMap = {
    bsc:  [['BNB (BEP-20)',   'bnb'],        ['USDT (BEP-20)', 'usdt-bep20']],
    eth:  [['ETH (ERC-20)',   'eth'],         ['USDT (ERC-20)', 'usdt-erc20']],
    tron: [['TRX (TRC-20)',   'trx'],         ['USDT (TRC-20)', 'usdt-trc20']],
  };
  const coins = coinMap[network];

  await sceneEdit(ctx,
    `💰 <b>Add Payment Wallet</b>\n\nStep 2 of 3 — Select coin on <b>${network.toUpperCase()}</b>:`,
    Markup.inlineKeyboard([
      ...coins.map(([label, code]) => [Markup.button.callback(label, `aw_coin_${code}`)]),
      [Markup.button.callback('❌ Cancel', 'aw_cancel')],
    ])
  );
  await ctx.answerCbQuery();
});

// Step 2 — Coin selected
scene.action(/^aw_coin_(.+)$/, async ctx => {
  const code    = ctx.match[1];
  const network = ctx.scene.session.data.network;

  const { rows } = await pool.query(
    `SELECT pw.address FROM payment_wallets pw WHERE pw.payment_method_code=$1`, [code]
  );

  if (rows.length) {
    await sceneEdit(ctx,
      `⚠️ A wallet for <b>${code.toUpperCase()}</b> already exists.\nDelete it first before adding a new one.`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'aw_cancel')]])
    );
    await ctx.answerCbQuery();
    return ctx.scene.leave();
  }

  ctx.scene.session.data.code = code;
  ctx.scene.session.data.awaitingAddress = true;

  await sceneEdit(ctx,
    `💰 <b>Add Payment Wallet</b>\n\nStep 3 of 3 — Send me the <b>${code.toUpperCase()}</b> wallet address:`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'aw_cancel')]])
  );
  await ctx.answerCbQuery();
});

// Step 3 — Address entered
scene.on('text', async ctx => {
  if (!ctx.scene.session.data.awaitingAddress) return;
  await deleteUserMsg(ctx);

  const address = ctx.message.text.trim();
  const network = ctx.scene.session.data.network;
  const code    = ctx.scene.session.data.code;

  let valid = false, reason = '';
  if (network === 'tron') {
    valid = isValidTronAddress(address);
    if (!valid) reason = 'Invalid TRON address. Must start with T and be 34 characters.';
  } else {
    const result = await validateBep20Wallet(address);
    valid  = result.valid;
    reason = result.reason || '';
  }

  if (!valid) {
    return sceneEdit(ctx,
      `💰 <b>Add Payment Wallet</b>\n\n❌ ${reason}\n\nPlease send a valid address:`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'aw_cancel')]])
    );
  }

  ctx.scene.session.data.address = address;
  ctx.scene.session.data.awaitingAddress = false;

  // Show confirmation in container — QR sent separately as photo
  await sceneEdit(ctx,
    [
      `✅ <b>Confirm Add Wallet</b>`,
      ``,
      `Network:  <b>${network.toUpperCase()}</b>`,
      `Method:   <b>${code.toUpperCase()}</b>`,
      `Address:  <code>${address}</code>`,
      ``,
      `<i>Confirm to save this wallet.</i>`,
    ].join('\n'),
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Confirm Add', 'aw_confirm')],
      [Markup.button.callback('❌ Cancel',      'aw_cancel')],
    ])
  );


});

// Confirm
scene.action('aw_confirm', async ctx => {
  const { network, code, address } = ctx.scene.session.data;

  await pool.query(
    `INSERT INTO payment_wallets (payment_method_code, network, address, is_active, added_by)
     VALUES ($1, $2, $3, true, $4)`,
    [code, network, address, ctx.from.id]
  );

  await ctx.answerCbQuery('✅ Wallet added');
  ctx.scene.leave();
  await handleWallets(ctx);
});

// Cancel
scene.action('aw_cancel', async ctx => {
  await ctx.answerCbQuery('Cancelled');
  ctx.scene.leave();
  await handleWallets(ctx);
});

module.exports = scene;
