'use strict';
const { Markup } = require('telegraf');

// ── Main Menu ─────────────────────────────────────────────────
// Inline dashboard — no persistent reply keyboard.

const MAIN_MENU_BUTTONS = Markup.inlineKeyboard([
  [
    Markup.button.callback('📊  Statistics',     'nav_stats'),
    Markup.button.callback('📋  Orders',         'nav_orders'),
  ],
  [
    Markup.button.callback('💰  Wallets',        'nav_wallets'),
    Markup.button.callback('⚙️  Settings',       'nav_settings'),
  ],
  [
    Markup.button.callback('👥  Admins',         'nav_admins'),
    Markup.button.callback('🔍  Unmatched TXs', 'nav_unmatched'),
  ],
]);

// Append a "🏠 Main Menu" button row to any inline keyboard rows array
function withHomeButton(rows) {
  return Markup.inlineKeyboard([
    ...rows,
    [Markup.button.callback('🏠  Main Menu', 'nav_home')],
  ]);
}

const WELCOME_TEXT = [
  `<b>⚡ Flash Exchange Admin Panel</b>`,
  ``,
  `Select a section below to get started.`,
].join('\n');

module.exports = { MAIN_MENU_BUTTONS, withHomeButton, WELCOME_TEXT };
