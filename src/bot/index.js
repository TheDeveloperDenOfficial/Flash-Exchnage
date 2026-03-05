'use strict';
const { Telegraf, Scenes, session } = require('telegraf');
const config   = require('../config');
const adminOnly = require('./middleware/auth');
const { MAIN_MENU } = require('./middleware/menu');

// Handlers
const { handleStats }    = require('./handlers/stats');
const { handleOrders, handleOrderDetail, handleOrderRetry } = require('./handlers/orders');
const { handleWallets, handleWalletToggle, handleWalletQR, handleWalletDelete, handleWalletConfirmDelete } = require('./handlers/wallets');
const { handleSettings } = require('./handlers/settings');
const { handleAdmins, handleAdminRemove } = require('./handlers/admins');
const { handleUnmatched, handleUnmatchedDetail, handleMarkResolved, handleMarkRefunded } = require('./handlers/unmatched');

// Scenes
const addWalletScene     = require('./scenes/addWallet');
const { changePriceScene, changeMinQtyScene, changeExpiryScene } = require('./scenes/settingsScenes');
const { addAdminScene, linkTransactionScene } = require('./scenes/adminScenes');

function createBot() {
  if (!config.telegramBotToken) {
    console.warn('[bot] TELEGRAM_BOT_TOKEN not set — bot disabled');
    return null;
  }

  const bot   = new Telegraf(config.telegramBotToken);
  const stage = new Scenes.Stage([
    addWalletScene,
    changePriceScene,
    changeMinQtyScene,
    changeExpiryScene,
    addAdminScene,
    linkTransactionScene,
  ]);

  // ── Middleware ──────────────────────────────────────────────
  bot.use(session());
  bot.use(stage.middleware());
  bot.use(adminOnly);

  // ── /start ──────────────────────────────────────────────────
  bot.start(async ctx => {
    await ctx.reply(
      `👋 Welcome to <b>Flash Exchange Admin</b>\n\nUse the menu below to manage your token sale.`,
      { parse_mode: 'HTML', ...MAIN_MENU }
    );
  });

  // ── Main Menu Buttons ───────────────────────────────────────
  bot.hears('📊 Stats',      ctx => handleStats(ctx));
  bot.hears('📋 Orders',     ctx => handleOrders(ctx, 0));
  bot.hears('💰 Wallets',    ctx => handleWallets(ctx));
  bot.hears('⚙️ Settings',   ctx => handleSettings(ctx));
  bot.hears('👥 Admins',     ctx => handleAdmins(ctx));
  bot.hears('🔍 Unmatched',  ctx => handleUnmatched(ctx));

  // ── Inline callback routing ─────────────────────────────────

  // Stats
  bot.action('stats_refresh', ctx => { ctx.answerCbQuery(); return handleStats(ctx); });

  // Orders
  bot.action('orders_list', ctx => { ctx.answerCbQuery(); return handleOrders(ctx, 0); });
  bot.action(/^orders_page_(\d+)$/, ctx => { ctx.answerCbQuery(); return handleOrders(ctx, parseInt(ctx.match[1], 10)); });
  bot.action(/^order_detail_(.+)$/, ctx => { ctx.answerCbQuery(); return handleOrderDetail(ctx, ctx.match[1]); });
  bot.action(/^order_retry_(.+)$/,  ctx => handleOrderRetry(ctx, ctx.match[1]));

  // Wallets
  bot.action('wallets_list',                    ctx => { ctx.answerCbQuery(); return handleWallets(ctx); });
  bot.action('wallet_add',                      ctx => { ctx.answerCbQuery(); ctx.scene.enter('add_wallet'); });
  bot.action(/^wallet_toggle_(\d+)$/,           ctx => handleWalletToggle(ctx, parseInt(ctx.match[1], 10)));
  bot.action(/^wallet_qr_(\d+)$/,               ctx => handleWalletQR(ctx, parseInt(ctx.match[1], 10)));
  bot.action(/^wallet_delete_(\d+)$/,           ctx => handleWalletDelete(ctx, parseInt(ctx.match[1], 10)));
  bot.action(/^wallet_confirm_delete_(\d+)$/,   ctx => handleWalletConfirmDelete(ctx, parseInt(ctx.match[1], 10)));

  // Settings
  bot.action('settings_price',   ctx => { ctx.answerCbQuery(); ctx.scene.enter('change_price'); });
  bot.action('settings_min_qty', ctx => { ctx.answerCbQuery(); ctx.scene.enter('change_min_qty'); });
  bot.action('settings_expiry',  ctx => { ctx.answerCbQuery(); ctx.scene.enter('change_expiry'); });

  // Admins
  bot.action('admin_add',                    ctx => { ctx.answerCbQuery(); ctx.scene.enter('add_admin'); });
  bot.action(/^admin_remove_(\d+)$/,         ctx => handleAdminRemove(ctx, ctx.match[1]));

  // Unmatched
  bot.action('unmatched_list',               ctx => { ctx.answerCbQuery(); return handleUnmatched(ctx); });
  bot.action(/^unmatched_detail_(\d+)$/,     ctx => handleUnmatchedDetail(ctx, parseInt(ctx.match[1], 10)));
  bot.action(/^unmatched_resolve_(\d+)$/,    ctx => handleMarkResolved(ctx, parseInt(ctx.match[1], 10)));
  bot.action(/^unmatched_refund_(\d+)$/,     ctx => handleMarkRefunded(ctx, parseInt(ctx.match[1], 10)));
  bot.action(/^unmatched_link_(\d+)$/,       ctx => {
    ctx.answerCbQuery();
    ctx.scene.session = { txId: parseInt(ctx.match[1], 10) };
    ctx.scene.enter('link_transaction');
  });

  // ── BotFather commands registration ────────────────────────
  bot.telegram.setMyCommands([
    { command: 'start',     description: 'Open main menu' },
    { command: 'stats',     description: 'View sales statistics' },
    { command: 'orders',    description: 'View recent orders' },
    { command: 'wallets',   description: 'Manage payment wallets' },
    { command: 'settings',  description: 'Change price, qty, expiry' },
    { command: 'admins',    description: 'Manage admin users' },
    { command: 'unmatched', description: 'Review unmatched transactions' },
  ]).catch(() => {});

  // Slash command aliases
  bot.command('stats',     ctx => handleStats(ctx));
  bot.command('orders',    ctx => handleOrders(ctx, 0));
  bot.command('wallets',   ctx => handleWallets(ctx));
  bot.command('settings',  ctx => handleSettings(ctx));
  bot.command('admins',    ctx => handleAdmins(ctx));
  bot.command('unmatched', ctx => handleUnmatched(ctx));

  // ── Error handler ───────────────────────────────────────────
  bot.catch((err, ctx) => {
    console.error('[bot] Error for', ctx.updateType, err.message);
    ctx.reply('An error occurred. Please try again.').catch(() => {});
  });

  return bot;
}

module.exports = { createBot };
