'use strict';
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');
const config = require('../config');

// ── Pool ─────────────────────────────────────────────────────
const poolConfig = config.databaseUrl
  ? { connectionString: config.databaseUrl, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 }
  : { ...config.db };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

// ── Migration ─────────────────────────────────────────────────
async function migrate() {
  const sql    = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[DB] Migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Bootstrap Admin ───────────────────────────────────────────
// Ensures the bootstrap admin from env exists in DB on every startup.
async function ensureBootstrapAdmin() {
  if (!config.bootstrapAdminId) return;
  await pool.query(
    `INSERT INTO admins (telegram_id, first_name, is_bootstrap, is_active, added_by)
     VALUES ($1, 'Bootstrap Admin', true, true, $1)
     ON CONFLICT (telegram_id) DO UPDATE SET is_active = true`,
    [config.bootstrapAdminId]
  );
}

// ── Settings Helpers ──────────────────────────────────────────
async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key=$1', [key]);
  return rows.length ? rows[0].value : null;
}

async function setSetting(key, value, adminTelegramId = null) {
  await pool.query(
    `INSERT INTO settings (key, value, updated_at, updated_by)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (key) DO UPDATE
     SET value=$2, updated_at=NOW(), updated_by=$3`,
    [key, String(value), adminTelegramId]
  );
}

async function getAllSettings() {
  const { rows } = await pool.query('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ── Health ────────────────────────────────────────────────────
async function ping() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0].ok === '1' || rows[0].ok === 1;
}

module.exports = { pool, migrate, ensureBootstrapAdmin, getSetting, setSetting, getAllSettings, ping };
