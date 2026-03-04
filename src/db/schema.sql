-- ============================================================
-- Flash Exchange – Database Schema
-- Auto-applied on startup via src/db/index.js
-- Safe to run repeatedly: all statements use IF NOT EXISTS
-- ============================================================

-- Enable UUID generation (Postgres 13+ has gen_random_uuid() built-in)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── orders ──────────────────────────────────────────────────
-- One row per purchase attempt. The unique_crypto_amount is
-- the fingerprinted amount the buyer must send EXACTLY.
CREATE TABLE IF NOT EXISTS orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What the buyer chose
  payment_method       VARCHAR(20)    NOT NULL,  -- 'bnb','usdt-bep20','eth','usdt-erc20','trx','usdt-trc20'
  network              VARCHAR(10)    NOT NULL,  -- 'bsc','eth','tron'
  coin_type            VARCHAR(10)    NOT NULL,  -- 'bnb','usdt','eth','trx'

  -- Amounts
  usdt_amount          NUMERIC(20,8)  NOT NULL,  -- USD value buyer wants to spend
  token_amount         NUMERIC(30,8)  NOT NULL,  -- FLASH tokens to deliver
  crypto_amount        NUMERIC(30,8)  NOT NULL,  -- base crypto equivalent
  unique_crypto_amount NUMERIC(30,8)  NOT NULL,  -- fingerprinted (unique) amount buyer must pay
  coin_price_usd       NUMERIC(20,8)  NOT NULL,  -- live price at order creation time
  fingerprint          INTEGER        NOT NULL,  -- the 5-digit identifying suffix

  -- Addresses
  payment_address      VARCHAR(100)   NOT NULL,  -- OUR wallet buyers send to
  receiving_wallet     VARCHAR(100)   NOT NULL,  -- buyer's wallet (token destination)

  -- Lifecycle
  status               VARCHAR(30)    NOT NULL DEFAULT 'waiting_payment',
  -- waiting_payment → matched → sending → completed
  -- also: expired, failed

  -- Blockchain evidence
  tx_hash_in           VARCHAR(100),             -- confirmed incoming payment tx
  tx_hash_out          VARCHAR(100),             -- outgoing FLASH token tx
  block_number_in      BIGINT,

  -- Timestamps
  matched_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  expires_at           TIMESTAMPTZ    NOT NULL,
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Fast lookup for the matching engine
CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders (status);

CREATE INDEX IF NOT EXISTS idx_orders_match_key
  ON orders (network, coin_type, unique_crypto_amount)
  WHERE status = 'waiting_payment';

CREATE INDEX IF NOT EXISTS idx_orders_created
  ON orders (created_at DESC);

-- ── wallet_transactions ──────────────────────────────────────
-- Every incoming transaction detected by the blockchain scanner.
-- Persisted even if it doesn't match an order (for admin review).
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id           SERIAL          PRIMARY KEY,
  tx_hash      VARCHAR(100)    NOT NULL UNIQUE,
  network      VARCHAR(10)     NOT NULL,
  coin_type    VARCHAR(10)     NOT NULL,
  from_address VARCHAR(100)    NOT NULL,
  to_address   VARCHAR(100)    NOT NULL,
  amount       NUMERIC(30,8)   NOT NULL,
  block_number BIGINT,
  detected_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  status       VARCHAR(30)     NOT NULL DEFAULT 'unmatched',
  -- unmatched | matched | expired_match | manual_review
  order_id     UUID            REFERENCES orders(id) ON DELETE SET NULL,
  raw_data     JSONB
);

CREATE INDEX IF NOT EXISTS idx_txns_network_coin
  ON wallet_transactions (network, coin_type);

CREATE INDEX IF NOT EXISTS idx_txns_status
  ON wallet_transactions (status);

CREATE INDEX IF NOT EXISTS idx_txns_amount
  ON wallet_transactions (amount);

CREATE INDEX IF NOT EXISTS idx_txns_detected
  ON wallet_transactions (detected_at DESC);

-- ── config ──────────────────────────────────────────────────
-- Key-value store for runtime state: block cursors, cached prices.
CREATE TABLE IF NOT EXISTS config (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT         NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed default config values (do nothing on conflict = idempotent)
INSERT INTO config (key, value) VALUES
  ('last_bsc_block',      '0'),
  ('last_eth_block',      '0'),
  ('last_tron_ts',        '0'),
  ('price_bnb_usd',       '0'),
  ('price_eth_usd',       '0'),
  ('price_trx_usd',       '0')
ON CONFLICT (key) DO NOTHING;

-- ── auto-update updated_at trigger ──────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS config_updated_at ON config;
CREATE TRIGGER config_updated_at
  BEFORE UPDATE ON config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
