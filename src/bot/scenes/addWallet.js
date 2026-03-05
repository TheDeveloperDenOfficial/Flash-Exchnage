'use strict';
const { Scenes, Markup } = require('telegraf');
const { pool } = require('../../db');
const { validateBep20Wallet, isValidTronAddress } = require('../../utils/validators');
const { generateQR } = require('../../utils/qr');

const scene = new Scenes.BaseScene('add_wallet');

scene.enter(async ctx => {
  ctx.scene.session.data = {};
  await ctx.reply(
    '💰 <b>Add Payment Wallet</b>\n\nStep 1 of 3 — Select network:',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('BSC',  'aw_net_bsc')],
        [Markup.button.callback('ETH',  'aw_net_eth')],
        [Markup.button.callback('TRON', 'aw_net_tron')],
        [Markup.button.callback('❌ Cancel', 'aw_cancel')],
      ]),
    }
  );
});

// Step 1 — Network selected
scene.action(/^aw_net_(.+)$/, async ctx => {
  const network = ctx.match[1];
  ctx.scene.session.data.network = network;

  const coinMap = { bsc: [['BNB', 'bnb'], ['USDT-BEP20', 'usdt-bep20']], eth: [['ETH', 'eth'], ['USDT-ERC20', 'usdt-erc20']], tron: [['TRX', 'trx'], ['USDT-TRC20', 'usdt-trc20']] };
  const coins   = coinMap[network];

  await ctx.editMessageText(
    `Step 2 of 3 — Select coin type on <b>${network.toUpperCase()}</b>:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        ...coins.map(([label, code]) => [Markup.button.callback(label, `aw_coin_${code}`)]),
        [Markup.button.callback('❌ Cancel', 'aw_cancel')],
      ]),
    }
  );
});

// Step 2 — Coin selected
scene.action(/^aw_coin_(.+)$/, async ctx => {
  const code    = ctx.match[1];
  const network = ctx.scene.session.data.network;

  // Check if wallet already exists for this method
  const { rows } = await pool.query(
    `SELECT pw.address FROM payment_wallets pw WHERE pw.payment_method_code=$1`, [code]
  );

  if (rows.length) {
    await ctx.editMessageText(
      `⚠️ A wallet for <b>${code.toUpperCase()}</b> already exists.\nDelete it first before adding a new one.`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💰 View Wallets', 'wallets_list')],
          [Markup.button.callback('❌ Cancel', 'aw_cancel')],
        ]),
      }
    );
    return ctx.scene.leave();
  }

  ctx.scene.session.data.code = code;
  await ctx.editMessageText(
    `Step 3 of 3 — Send me the <b>${code.toUpperCase()}</b> wallet address:`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'aw_cancel')]]) }
  );
  ctx.scene.session.data.awaitingAddress = true;
});

// Step 3 — Address entered
scene.on('text', async ctx => {
  if (!ctx.scene.session.data.awaitingAddress) return;

  const address = ctx.message.text.trim();
  const network = ctx.scene.session.data.network;
  const code    = ctx.scene.session.data.code;

  // Validate address based on network
  let valid = false;
  let reason = '';

  if (network === 'tron') {
    valid = isValidTronAddress(address);
    if (!valid) reason = 'Invalid Tron address format. Must start with T and be 34 characters.';
  } else {
    const result = await validateBep20Wallet(address);
    valid  = result.valid;
    reason = result.reason || '';
    // Allow contract addresses for payment wallets (it's OUR wallet, not buyer's)
    if (!valid && reason.includes('smart contract')) { valid = true; reason = ''; }
  }

  if (!valid) {
    return ctx.reply(`❌ ${reason}\n\nPlease send a valid address or tap Cancel.`);
  }

  // Show confirmation with QR
  ctx.scene.session.data.address = address;
  ctx.scene.session.data.awaitingAddress = false;

  const qrBuffer = await generateQR(address);

  await ctx.replyWithPhoto({ source: qrBuffer }, {
    caption: [
      `✅ <b>Address Valid</b>\n`,
      `Network:  ${network.toUpperCase()}`,
      `Method:   ${code.toUpperCase()}`,
      `Address:  <code>${address}</code>`,
    ].join('\n'),
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('✅ Confirm Add', 'aw_confirm')],
      [Markup.button.callback('❌ Cancel',      'aw_cancel')],
    ]),
  });
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
  await ctx.reply(`✅ <b>Wallet added successfully!</b>\n\n${code.toUpperCase()}\n<code>${address}</code>`, { parse_mode: 'HTML' });
  ctx.scene.leave();
});

// Cancel
scene.action('aw_cancel', async ctx => {
  await ctx.answerCbQuery('Cancelled');
  await ctx.reply('Cancelled.', Markup.removeKeyboard());
  ctx.scene.leave();
});

module.exports = scene;
