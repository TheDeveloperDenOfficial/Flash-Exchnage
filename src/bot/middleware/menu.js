'use strict';
const { Markup } = require('telegraf');

const MAIN_MENU = Markup.keyboard([
  ['📊 Stats',    '📋 Orders'],
  ['💰 Wallets',  '⚙️ Settings'],
  ['👥 Admins',   '🔍 Unmatched'],
]).resize().persistent();

module.exports = { MAIN_MENU };
