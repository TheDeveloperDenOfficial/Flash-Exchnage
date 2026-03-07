'use strict';

/**
 * smartEdit — Fixes the core spam problem.
 *
 * Old pattern everywhere:
 *   ctx.editMessageText(msg).catch(() => ctx.reply(msg))
 *
 * Problem: When Telegram returns "message is not modified" (user taps Refresh
 * but data hasn't changed), catch fires ctx.reply() sending a brand new message.
 * Result: duplicate messages pile up every time.
 *
 * This helper:
 *   "not modified"  → silently do nothing  (content already correct)
 *   anything else   → fall back to reply   (message deleted / too old)
 */
async function smartEdit(ctx, text, opts = {}) {
  if (!ctx.callbackQuery) {
    return ctx.reply(text, opts);
  }
  try {
    await ctx.editMessageText(text, opts);
  } catch (err) {
    const desc = err.description || err.message || '';
    if (desc.includes('message is not modified')) return; // already showing correct content
    return ctx.reply(text, opts).catch(() => {});
  }
}

// Always sends a new message — use for async results (retry outcome, QR, etc.)
async function smartReply(ctx, text, opts = {}) {
  return ctx.reply(text, opts).catch(() => {});
}

module.exports = { smartEdit, smartReply };
