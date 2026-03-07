'use strict';
const { Telegraf, Scenes, session } = require('telegraf');
const config      = require('../config');
const adminOnly   = require('./middleware/auth');
const containers  = require('./containers');

// Handlers
const { handleHome }     = require('./handlers/home');
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

  // ── /start → silently ignored (containers handle everything) ──
  bot.start(async ctx => {
    // Delete the /start command message to keep chat clean
    try { await ctx.deleteMessage(); } catch {}
  });

  // ── Refresh actions for containers ──────────────────────────
  bot.action('refresh_alerts', ctx => containers.refreshAlerts(ctx));
  bot.action('refresh_orders', ctx => containers.refreshOrders(ctx));

  // ── Navigation ──────────────────────────────────────────────
  bot.action('nav_home',      ctx => { ctx.answerCbQuery(); return handleHome(ctx); });
  bot.action('nav_stats',     ctx => { ctx.answerCbQuery(); return handleStats(ctx); });
  bot.action('nav_orders',    ctx => { ctx.answerCbQuery(); return handleOrders(ctx, 0); });
  bot.action('nav_wallets',   ctx => { ctx.answerCbQuery(); return handleWallets(ctx); });
  bot.action('nav_settings',  ctx => { ctx.answerCbQuery(); return handleSettings(ctx); });
  bot.action('nav_admins',    ctx => { ctx.answerCbQuery(); return handleAdmins(ctx); });
  bot.action('nav_unmatched', ctx => { ctx.answerCbQuery(); return handleUnmatched(ctx); });

  // ── Orders ──────────────────────────────────────────────────
  bot.action(/^orders_page_(\d+)$/,  ctx => { ctx.answerCbQuery(); return handleOrders(ctx, parseInt(ctx.match[1], 10)); });
  bot.action(/^order_detail_(.+)$/,  ctx => { ctx.answerCbQuery(); return handleOrderDetail(ctx, ctx.match[1]); });
  bot.action(/^order_retry_(.+)$/,   ctx => handleOrderRetry(ctx, ctx.match[1]));

  // ── Wallets ─────────────────────────────────────────────────
  bot.action('wallet_add',                    ctx => { ctx.answerCbQuery(); ctx.scene.enter('add_wallet'); });
  bot.action(/^wallet_toggle_(\d+)$/,         ctx => handleWalletToggle(ctx, parseInt(ctx.match[1], 10)));
  bot.action(/^wallet_qr_(\d+)$/,             ctx => handleWalletQR(ctx, parseInt(ctx.match[1], 10)));
  bot.action(/^wallet_delete_(\d+)$/,         ctx => handleWalletDelete(ctx, parseInt(ctx.match[1], 10)));
  bot.action(/^wallet_confirm_delete_(\d+)$/, ctx => handleWalletConfirmDelete(ctx, parseInt(ctx.match[1], 10)));

  // ── Settings ────────────────────────────────────────────────
  bot.action('settings_price',   ctx => { ctx.answerCbQuery(); ctx.scene.enter('change_price'); });
  bot.action('settings_min_qty', ctx => { ctx.answerCbQuery(); ctx.scene.enter('change_min_qty'); });
  bot.action('settings_expiry',  ctx => { ctx.answerCbQuery(); ctx.scene.enter('change_expiry'); });

  // ── Admins ──────────────────────────────────────────────────
  bot.action('admin_add',             ctx => { ctx.answerCbQuery(); ctx.scene.enter('add_admin'); });
  bot.action(/^admin_remove_(\d+)$/,  ctx => handleAdminRemove(ctx, ctx.match[1]));

  // ── Unmatched ────────────────────────────────────────────────
  bot.action(/^unmatched_detail_(\d+)$/,  ctx => handleUnmatchedDetail(ctx, parseInt(ctx.match[1], 10)));
  bot.action(/^unmatched_resolve_(\d+)$/, ctx => handleMarkResolved(ctx, parseInt(ctx.match[1], 10)));
  bot.action(/^unmatched_refund_(\d+)$/,  ctx => handleMarkRefunded(ctx, parseInt(ctx.match[1], 10)));
  bot.action(/^unmatched_link_(\d+)$/,    ctx => {
    ctx.answerCbQuery();
    ctx.scene.session = { txId: parseInt(ctx.match[1], 10) };
    ctx.scene.enter('link_transaction');
  });

  // ── BotFather commands — clear all so /start doesn't appear ──
  bot.telegram.setMyCommands([]).catch(() => {});

  // ── Error handler ────────────────────────────────────────────
  bot.catch((err, ctx) => {
    console.error('[bot] Error for', ctx.updateType, err.message);
    ctx.reply('An error occurred. Please try again.').catch(() => {});
  });

  return bot;
}

module.exports = { createBot };
