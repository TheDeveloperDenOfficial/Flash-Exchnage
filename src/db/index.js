'use strict';
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger').child({ service: 'db' });

// ── Connection Pool ──────────────────────────────────────────
let poolConfig;

if (config.databaseUrl) {
  poolConfig = {
    connectionString: config.databaseUrl,
    ssl: config.db.ssl,
    max: config.db.max,
    idleTimeoutMillis: config.db.idleTimeoutMillis,
    connectionTimeoutMillis: config.db.connectionTimeoutMillis,
  };
} else {
  poolConfig = {
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    ssl: config.db.ssl,
    max: config.db.max,
    idleTimeoutMillis: config.db.idleTimeoutMillis,
    connectionTimeoutMillis: config.db.connectionTimeoutMillis,
  };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Unexpected postgres pool error', { error: err.message });
});

// ── Auto-Migration ───────────────────────────────────────────
/**
 * Reads schema.sql and executes it against the database.
 * All statements use IF NOT EXISTS so this is fully idempotent.
 * Called once at server startup — blocks until complete.
 */
async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  logger.info('Running database migration…');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    logger.info('Database migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Database migration FAILED', { error: err.message, stack: err.stack });
    throw err; // Fatal — abort startup
  } finally {
    client.release();
  }
}

// ── Config Helpers ───────────────────────────────────────────
/**
 * Read a value from the config table.
 * @param {string} key
 * @returns {Promise<string|null>}
 */
async function getConfig(key) {
  const { rows } = await pool.query('SELECT value FROM config WHERE key = $1', [key]);
  return rows.length ? rows[0].value : null;
}

/**
 * Write a value to the config table (upsert).
 * @param {string} key
 * @param {string|number} value
 */
async function setConfig(key, value) {
  await pool.query(
    `INSERT INTO config (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, String(value)]
  );
}

// ── Health Check ─────────────────────────────────────────────
async function ping() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0].ok === 1 || rows[0].ok === '1';
}

module.exports = { pool, migrate, getConfig, setConfig, ping };
