'use strict';
const { pool } = require('../db');
const logger   = require('../utils/logger').child({ service: 'containers' });

let _bot = null;
function setBot(bot) { _bot = bot; }

const MAX_ALERTS = 10;
const MAX_ORDERS = 10;

// ── DB helpers ────────────────────────────────────────────────

async function getAdmins() {
  const { rows } = await pool.query(`SELECT telegram_id FROM admins WHERE is_active=true`);
  return rows.map(r => r.telegram_id);
}

async function getContainer(telegramId) {
  const { rows } = await pool.query(
    `SELECT * FROM admin_containers WHERE telegram_id=$1`, [telegramId]
  );
  if (rows.length) return rows[0];
  // Bootstrap row if missing
  await pool.query(
    `INSERT INTO admin_containers (telegram_id) VALUES ($1) ON CONFLICT DO NOTHING`, [telegramId]
  );
  return { telegram_id: telegramId, menu_msg_id: null, alerts_msg_id: null, orders_msg_id: null, alerts_log: '[]', orders_log: '[]' };
}

async function saveContainer(telegramId, fields) {
  const sets   = Object.keys(fields).map((k, i) => `${k}=$${i + 2}`).join(', ');
  const values = Object.values(fields);
  await pool.query(
    `INSERT INTO admin_containers (telegram_id, ${Object.keys(fields).join(', ')}, updated_at)
     VALUES ($1, ${values.map((_, i) => `$${i + 2}`).join(', ')}, NOW())
     ON CONFLICT (telegram_id) DO UPDATE SET ${sets}, updated_at=NOW()`,
    [telegramId, ...values]
  );
}

// ── Formatters ────────────────────────────────────────────────

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtTimestamp() {
  return new Date().toUTCString().replace(/:\d\d GMT$/, ' UTC');
}

// ── Container 2: Alerts ───────────────────────────────────────

function buildAlertsMsg(log) {
  const lines = [`🚨 <b>Alerts</b>  <i>(${log.length} unresolved)</i>`, ``];

  if (!log.length) {
    lines.push(`✅ <i>All clear — no active alerts</i>`);
  } else {
    for (const entry of log) {
      lines.push(entry.text);
      lines.push(`<i>${timeAgo(entry.ts)}</i>`);
      lines.push(``);
    }
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`🕐 <i>${fmtTimestamp()}</i>`);
  return lines.join('\n');
}

// ── Container 3: Live Orders ──────────────────────────────────

function buildOrdersMsg(log) {
  const lines = [`💰 <b>Live Orders</b>`, ``];

  if (!log.length) {
    lines.push(`📭 <i>No recent order activity</i>`);
  } else {
    for (const entry of log) {
      lines.push(entry.text);
      lines.push(`<i>${timeAgo(entry.ts)}</i>`);
      lines.push(``);
    }
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`🕐 <i>${fmtTimestamp()}</i>`);
  return lines.join('\n');
}

// ── Safe send/edit helpers ────────────────────────────────────

async function safeSend(chatId, text, keyboard = null) {
  try {
    const opts = { parse_mode: 'HTML' };
    if (keyboard) opts.reply_markup = keyboard;
    const msg = await _bot.telegram.sendMessage(chatId, text, opts);
    return msg.message_id;
  } catch (err) {
    logger.warn(`[containers] safeSend failed for ${chatId}: ${err.message}`);
    return null;
  }
}

async function safeEdit(chatId, msgId, text, keyboard = null) {
  if (!msgId) return false;
  try {
    const opts = { parse_mode: 'HTML' };
    if (keyboard) opts.reply_markup = keyboard.reply_markup;
    await _bot.telegram.editMessageText(chatId, msgId, null, text, opts);
    return true;
  } catch (err) {
    const desc = err.description || err.message || '';
    if (desc.includes('message is not modified')) return true;   // already correct
    if (desc.includes('message to edit not found') ||
        desc.includes('MESSAGE_ID_INVALID') ||
        desc.includes('too old')) return false;                  // needs recreate
    logger.warn(`[containers] safeEdit failed for ${chatId}/${msgId}: ${desc}`);
    return false;
  }
}

async function safeDelete(chatId, msgId) {
  if (!msgId) return;
  try {
    await _bot.telegram.deleteMessage(chatId, msgId);
  } catch { /* ignore */ }
}

// ── Clear all known messages for an admin ────────────────────

async function clearAdminChat(telegramId) {
  const c = await getContainer(telegramId);
  // Delete all 3 containers silently
  await Promise.all([
    safeDelete(telegramId, c.menu_msg_id),
    safeDelete(telegramId, c.alerts_msg_id),
    safeDelete(telegramId, c.orders_msg_id),
  ]);
  await saveContainer(telegramId, {
    menu_msg_id:   null,
    alerts_msg_id: null,
    orders_msg_id: null,
    alerts_log:    '[]',
    orders_log:    '[]',
  });
}

// ── Startup: clear + rebuild containers for all admins ────────

async function initContainers(buildMenuFn) {
  if (!_bot) return;
  const admins = await getAdmins();

  for (const adminId of admins) {
    try {
      // 1. Clear old containers
      await clearAdminChat(adminId);

      // Check if there are active alerts or orders
      const [alertsRes, ordersRes] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS cnt FROM wallet_transactions WHERE status='unmatched'`),
        pool.query(`SELECT COUNT(*)::int AS cnt FROM orders WHERE status IN ('waiting_payment','matched','sending') AND expires_at > NOW()`),
      ]);

      const hasAlerts = parseInt(alertsRes.rows[0].cnt, 10) > 0;
      const hasOrders = parseInt(ordersRes.rows[0].cnt, 10) > 0;

      // 2. Send Container 2 (Alerts) if needed — appears above
      //    Refresh button embedded directly (no orphan spacer messages)
      let alertsLog = [];
      let alertsMsgId = null;
      if (hasAlerts) {
        alertsLog = await buildCurrentAlertsLog();
        alertsMsgId = await safeSend(
          adminId,
          buildAlertsMsg(alertsLog),
          { inline_keyboard: [[{ text: '🔄 Refresh Alerts', callback_data: 'refresh_alerts' }]] }
        );
      }

      // 3. Send Container 3 (Live Orders) if needed — appears above
      let ordersLog = [];
      let ordersMsgId = null;
      if (hasOrders) {
        ordersLog = await buildCurrentOrdersLog();
        ordersMsgId = await safeSend(
          adminId,
          buildOrdersMsg(ordersLog),
          { inline_keyboard: [[{ text: '🔄 Refresh Orders', callback_data: 'refresh_orders' }]] }
        );
      }

      // 4. Send Container 1 (Main Menu) — always last, closest to input
      //    Send text + keyboard in one call to avoid editMessageReplyMarkup race
      const { msg, keyboard } = await buildMenuFn();
      const menuMsgId = await safeSend(
        adminId,
        msg,
        keyboard ? keyboard.reply_markup : null
      );

      await saveContainer(adminId, {
        menu_msg_id:   menuMsgId,
        alerts_msg_id: alertsMsgId,
        orders_msg_id: ordersMsgId,
        alerts_log:    JSON.stringify(alertsLog),
        orders_log:    JSON.stringify(ordersLog),
      });

      logger.info(`[containers] Initialized for admin ${adminId}`);
    } catch (err) {
      logger.error(`[containers] Init failed for admin ${adminId}: ${err.message}`);
    }
  }
}

// ── Build current alerts log from DB ─────────────────────────

async function buildCurrentAlertsLog() {
  const { rows } = await pool.query(
    `SELECT * FROM wallet_transactions WHERE status='unmatched' ORDER BY detected_at DESC LIMIT ${MAX_ALERTS}`
  );
  return rows.map(t => ({
    ts:   t.detected_at,
    text: [
      `🔴 <b>Unmatched TX</b>  |  ${t.network.toUpperCase()}  |  ${t.coin_symbol}`,
      `   Amount: <b>${t.amount}</b>  |  From: <code>${t.from_address.slice(0, 14)}…</code>`,
    ].join('\n'),
  }));
}

// ── Build current orders log from DB ─────────────────────────

async function buildCurrentOrdersLog() {
  const { rows } = await pool.query(
    `SELECT * FROM orders
     WHERE status IN ('waiting_payment','matched','sending','completed','failed')
     ORDER BY updated_at DESC LIMIT ${MAX_ORDERS}`
  );
  return rows.map(o => ({
    ts:   o.updated_at,
    text: formatOrderEntry(o),
  }));
}

function formatOrderEntry(order) {
  const statusMap = {
    waiting_payment: '⏳ Awaiting Payment',
    matched:         '🔍 Matched',
    pending_release: '🔔 Pending Release',
    sending:         '📤 Sending Tokens',
    completed:       '✅ Completed',
    failed:          '❌ Failed',
    expired:         '⏰ Expired',
  };
  const status = statusMap[order.status] || order.status;
  const lines = [
    `${status}  |  <b>${Number(order.token_amount).toLocaleString()} FLASH</b>  |  ${order.coin_symbol} (${order.network.toUpperCase()})`,
  ];
  if (order.tx_hash_out) lines.push(`   TX: <code>${order.tx_hash_out.slice(0, 18)}…</code>`);
  else if (order.tx_hash_in) lines.push(`   TX in: <code>${order.tx_hash_in.slice(0, 18)}…</code>`);
  return lines.join('\n');
}

// ── Update Container 2 (Alerts) with inline button ───────────

async function pushAlertWithButton(entry, callbackData, buttonLabel) {
  if (!_bot) return;
  const admins = await getAdmins();
  const keyboard = { inline_keyboard: [[{ text: buttonLabel, callback_data: callbackData }]] };

  for (const adminId of admins) {
    try {
      // Always send as a new message so the button is fresh and tappable
      await safeSend(adminId, entry, keyboard);
    } catch (err) {
      logger.warn(`[containers] pushAlertWithButton failed for ${adminId}: ${err.message}`);
    }
  }
}

// ── Update Container 2 (Alerts) ──────────────────────────────

async function pushAlert(entry) {
  if (!_bot) return;
  const admins = await getAdmins();

  for (const adminId of admins) {
    try {
      const c   = await getContainer(adminId);
      const log = JSON.parse(c.alerts_log || '[]');

      // Prepend new entry
      log.unshift({ ts: new Date().toISOString(), text: entry });
      if (log.length > MAX_ALERTS) log.length = MAX_ALERTS;

      const text = buildAlertsMsg(log);

      let msgId = c.alerts_msg_id;

      // Try editing existing container
      if (msgId) {
        const ok = await safeEdit(adminId, msgId, text);
        if (!ok) {
          // Message too old or gone — delete and recreate
          await safeDelete(adminId, msgId);
          msgId = await safeSend(adminId, text, { inline_keyboard: [[{ text: '🔄 Refresh Alerts', callback_data: 'refresh_alerts' }]] });
        }
      } else {
        // Container doesn't exist yet — create it with refresh button
        msgId = await safeSend(adminId, text, { inline_keyboard: [[{ text: '🔄 Refresh Alerts', callback_data: 'refresh_alerts' }]] });
      }

      await saveContainer(adminId, { alerts_msg_id: msgId, alerts_log: JSON.stringify(log) });
    } catch (err) {
      logger.warn(`[containers] pushAlert failed for ${adminId}: ${err.message}`);
    }
  }
}

// ── Update Container 3 (Live Orders) ─────────────────────────

async function pushOrderEvent(order) {
  if (!_bot) return;
  const admins = await getAdmins();
  const entry  = { ts: new Date().toISOString(), text: formatOrderEntry(order) };

  for (const adminId of admins) {
    try {
      const c   = await getContainer(adminId);
      let   log = JSON.parse(c.orders_log || '[]');

      // Update existing entry for same order, or prepend new
      const existingIdx = log.findIndex(e => e.orderId === order.id);
      if (existingIdx >= 0) {
        log[existingIdx] = { ...entry, orderId: order.id };
        // Move to top
        const [updated] = log.splice(existingIdx, 1);
        log.unshift(updated);
      } else {
        log.unshift({ ...entry, orderId: order.id });
      }
      if (log.length > MAX_ORDERS) log.length = MAX_ORDERS;

      const text = buildOrdersMsg(log);

      let msgId = c.orders_msg_id;

      const ordersKeyboard = { inline_keyboard: [[{ text: '🔄 Refresh Orders', callback_data: 'refresh_orders' }]] };
      if (msgId) {
        const ok = await safeEdit(adminId, msgId, text);
        if (!ok) {
          await safeDelete(adminId, msgId);
          msgId = await safeSend(adminId, text, ordersKeyboard);
        }
      } else {
        msgId = await safeSend(adminId, text, ordersKeyboard);
      }

      await saveContainer(adminId, { orders_msg_id: msgId, orders_log: JSON.stringify(log) });
    } catch (err) {
      logger.warn(`[containers] pushOrderEvent failed for ${adminId}: ${err.message}`);
    }
  }
}

// ── Refresh handlers (called from bot actions) ────────────────

async function refreshAlerts(ctx) {
  const adminId = ctx.from.id;
  const c       = await getContainer(adminId);
  const log     = JSON.parse(c.alerts_log || '[]');
  const text    = buildAlertsMsg(log);

  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML' });
  } catch { /* already up to date */ }
  await ctx.answerCbQuery('✅ Alerts refreshed');
}

async function refreshOrders(ctx) {
  const adminId = ctx.from.id;
  const c       = await getContainer(adminId);
  const log     = JSON.parse(c.orders_log || '[]');
  const text    = buildOrdersMsg(log);

  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML' });
  } catch { /* already up to date */ }
  await ctx.answerCbQuery('✅ Orders refreshed');
}

// ── Update Container 1 (Main Menu) ───────────────────────────

async function updateMenu(adminId, msg, keyboard) {
  const c = await getContainer(adminId);
  let msgId = c.menu_msg_id;

  const opts = { parse_mode: 'HTML', ...(keyboard || {}) };

  if (msgId) {
    const ok = await safeEdit(adminId, msgId, msg, keyboard);
    if (!ok) {
      await safeDelete(adminId, msgId);
      const sent = await _bot.telegram.sendMessage(adminId, msg, opts);
      msgId = sent?.message_id || null;
      await saveContainer(adminId, { menu_msg_id: msgId });
    }
  } else {
    const sent = await _bot.telegram.sendMessage(adminId, msg, opts);
    msgId = sent?.message_id || null;
    await saveContainer(adminId, { menu_msg_id: msgId });
  }
}

module.exports = {
  setBot,
  initContainers,
  clearAdminChat,
  pushAlert,
  pushAlertWithButton,
  pushOrderEvent,
  refreshAlerts,
  refreshOrders,
  updateMenu,
};
