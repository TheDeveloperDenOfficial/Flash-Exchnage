'use strict';
const { pool } = require('../../db');

/**
 * Get the stored menu message ID for this admin from DB.
 * Store it in scene session on first call so we reuse it throughout the scene.
 */
async function getMenuMsgId(ctx) {
  if (ctx.scene.session._menuMsgId) return ctx.scene.session._menuMsgId;
  try {
    const { rows } = await pool.query(
      `SELECT menu_msg_id FROM admin_containers WHERE telegram_id=$1`, [ctx.from.id]
    );
    const id = rows[0]?.menu_msg_id || null;
    ctx.scene.session._menuMsgId = id;
    return id;
  } catch { return null; }
}

/**
 * Edit the container menu message in place.
 * Falls back to reply only if menu message is gone.
 */
async function sceneEdit(ctx, text, opts = {}) {
  const msgId = await getMenuMsgId(ctx);
  const chatId = ctx.from.id;

  if (msgId) {
    try {
      await ctx.telegram.editMessageText(chatId, msgId, null, text, {
        parse_mode: 'HTML',
        ...opts,
      });
      return;
    } catch (err) {
      const desc = err.description || err.message || '';
      if (desc.includes('message is not modified')) return;
      // Message gone — fall through to reply
    }
  }

  // Fallback: send new message and save its ID
  const sent = await ctx.reply(text, { parse_mode: 'HTML', ...opts });
  ctx.scene.session._menuMsgId = sent.message_id;
  await pool.query(
    `INSERT INTO admin_containers (telegram_id, menu_msg_id, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (telegram_id) DO UPDATE SET menu_msg_id=$2, updated_at=NOW()`,
    [ctx.from.id, sent.message_id]
  );
}

/**
 * Delete the user's typed message to keep chat clean.
 */
async function deleteUserMsg(ctx) {
  try { await ctx.deleteMessage(); } catch {}
}

module.exports = { sceneEdit, deleteUserMsg };
