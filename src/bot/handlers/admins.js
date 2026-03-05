'use strict';
const { Markup } = require('telegraf');
const { pool } = require('../../db');
const { withHomeButton } = require('../middleware/menu');

async function handleAdmins(ctx) {
  const { rows } = await pool.query(
    `SELECT * FROM admins WHERE is_active=true ORDER BY created_at ASC`
  );

  const lines = rows.map((a, i) => {
    const name  = a.username ? `@${a.username}` : (a.first_name || 'Unknown');
    const badge = a.is_bootstrap ? '  👑 Bootstrap' : '';
    return `<b>${i + 1}. ${name}${badge}</b>\n   ID: <code>${a.telegram_id}</code>  ·  Added: ${new Date(a.created_at).toLocaleDateString()}`;
  }).join('\n\n');

  const msg = [
    `👥 <b>Admin Users</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    lines,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].join('\n');

  const removeBtns = rows
    .filter(a => !a.is_bootstrap)
    .map(a => [Markup.button.callback(`🗑  Remove ${a.username || a.telegram_id}`, `admin_remove_${a.telegram_id}`)]);

  const keyboard = withHomeButton([
    [Markup.button.callback('➕  Add Admin', 'admin_add')],
    ...removeBtns,
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { parse_mode: 'HTML', ...keyboard }).catch(() =>
      ctx.reply(msg, { parse_mode: 'HTML', ...keyboard })
    );
  } else {
    await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
  }
}

async function handleAdminRemove(ctx, telegramId) {
  const id = parseInt(telegramId, 10);
  const { rows } = await pool.query(`SELECT * FROM admins WHERE telegram_id=$1`, [id]);
  if (!rows.length) return ctx.answerCbQuery('Admin not found');
  if (rows[0].is_bootstrap) return ctx.answerCbQuery('Cannot remove bootstrap admin');

  await pool.query(`UPDATE admins SET is_active=false WHERE telegram_id=$1`, [id]);
  await ctx.answerCbQuery('Admin removed');

  try { await ctx.telegram.sendMessage(id, '⛔ You have been removed as a Flash Exchange admin.'); } catch {}

  return handleAdmins(ctx);
}

module.exports = { handleAdmins, handleAdminRemove };
