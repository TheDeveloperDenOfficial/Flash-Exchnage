'use strict';
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');
const config = require('../config');

// ── Pool ─────────────────────────────────────────────────────
// Coolify's internal PostgreSQL uses a self-signed certificate.
// The connection is internal (container-to-container on a private Docker
// network), so skipping cert verification is appropriate here.
//
// IMPORTANT: newer versions of pg (≥8.x) treat `sslmode=require` in the
// connection string as `verify-full`, which overrides the `ssl` object and
// causes "unable to verify the first certificate". We must strip any `sslmode`
// query parameter from the DATABASE_URL before passing it to the Pool so that
// the explicit `ssl` object below is the sole authority on SSL behaviour.
const sslConfig = { rejectUnauthorized: false };

/**
 * Strip `sslmode` (and the legacy `uselibpqcompat`) query params from a
 * postgres connection string so that pg's `ssl` pool option takes full effect.
 */
function sanitiseDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('uselibpqcompat');
    return parsed.toString();
  } catch {
    // Not a valid URL (e.g. already a plain DSN) — return as-is.
    return url;
  }
}

const poolConfig = config.databaseUrl
  ? {
      connectionString: sanitiseDatabaseUrl(config.databaseUrl),
      ssl: sslConfig,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  : { ...config.db, ssl: sslConfig };

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
