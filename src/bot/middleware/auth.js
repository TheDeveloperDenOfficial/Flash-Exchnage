'use strict';
const { pool } = require('../../db');

/**
 * Telegraf middleware — allows only active admins.
 * Updates last_seen_at and syncs username/first_name on each interaction.
 */
async function adminOnly(ctx, next) {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const { rows } = await pool.query(
      `SELECT id FROM admins WHERE telegram_id=$1 AND is_active=true`,
      [userId]
    );

    if (!rows.length) {
      return ctx.reply('⛔ Access denied. You are not an authorised admin.');
    }

    // Update last seen + sync Telegram profile
    await pool.query(
      `UPDATE admins
       SET last_seen_at=NOW(), username=$1, first_name=$2
       WHERE telegram_id=$3`,
      [ctx.from.username || null, ctx.from.first_name || null, userId]
    );

    return next();
  } catch (err) {
    console.error('[auth] DB error:', err.message);
    return ctx.reply('An error occurred. Please try again.');
  }
}

module.exports = adminOnly;
