-- ============================================================
-- Flash Exchange – Database Schema v2
-- All statements use IF NOT EXISTS — fully idempotent
-- Auto-applied on every startup
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. settings ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT         NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by BIGINT
);

INSERT INTO settings (key, value) VALUES
  ('token_price_usd',      '0.02'),
  ('token_symbol',         'FLASH'),
  ('min_order_qty',        '100'),
  ('order_expiry_minutes', '30'),
  ('last_bsc_block',       '0'),
  ('last_eth_block',       '0'),
  ('last_tron_ts',         '0'),
  ('price_bnb_usd',        '0'),
  ('price_eth_usd',        '0'),
  ('price_trx_usd',        '0')
ON CONFLICT (key) DO NOTHING;

-- ── 2. payment_methods ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_methods (
  id          SERIAL       PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  code        VARCHAR(50)  NOT NULL UNIQUE,
  network     VARCHAR(20)  NOT NULL,
  coin_symbol VARCHAR(20)  NOT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO payment_methods (name, code, network, coin_symbol, is_active) VALUES
  ('BNB (BEP-20)',   'bnb',        'bsc',  'BNB',  true),
  ('USDT (BEP-20)',  'usdt-bep20', 'bsc',  'USDT', true),
  ('ETH (ERC-20)',   'eth',        'eth',  'ETH',  true),
  ('USDT (ERC-20)',  'usdt-erc20', 'eth',  'USDT', true),
  ('TRX (TRC-20)',   'trx',        'tron', 'TRX',  true),
  ('USDT (TRC-20)',  'usdt-trc20', 'tron', 'USDT', true)
ON CONFLICT (code) DO NOTHING;

-- ── 3. payment_wallets ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_wallets (
  id                  SERIAL       PRIMARY KEY,
  payment_method_code VARCHAR(50)  NOT NULL UNIQUE REFERENCES payment_methods(code) ON DELETE RESTRICT,
  network             VARCHAR(20)  NOT NULL,
  address             VARCHAR(100) NOT NULL,
  is_active           BOOLEAN      NOT NULL DEFAULT true,
  added_by            BIGINT       NOT NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_active
  ON payment_wallets (payment_method_code)
  WHERE is_active = true;

-- ── 4. orders ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method_code     VARCHAR(50)  NOT NULL,
  network                 VARCHAR(20)  NOT NULL,
  coin_symbol             VARCHAR(20)  NOT NULL,
  usdt_amount             NUMERIC(20,8) NOT NULL,
  token_amount            NUMERIC(30,8) NOT NULL,
  token_price_snapshot    NUMERIC(20,8) NOT NULL,
  crypto_amount           NUMERIC(30,8) NOT NULL,
  unique_crypto_amount    NUMERIC(30,8) NOT NULL,
  coin_price_usd_snapshot NUMERIC(20,8) NOT NULL,
  fingerprint             INTEGER      NOT NULL,
  payment_address         VARCHAR(100) NOT NULL,
  receiving_wallet        VARCHAR(100) NOT NULL,
  status                  VARCHAR(30)  NOT NULL DEFAULT 'waiting_payment',
  tx_hash_in              VARCHAR(100),
  tx_hash_out             VARCHAR(100),
  block_number_in         BIGINT,
  retry_count             INTEGER      NOT NULL DEFAULT 0,
  manually_completed_by   BIGINT,
  matched_at              TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ  NOT NULL,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_match    ON orders (network, coin_symbol, unique_crypto_amount) WHERE status = 'waiting_payment';
CREATE INDEX IF NOT EXISTS idx_orders_wallet   ON orders (receiving_wallet, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders (created_at DESC);

-- ── 5. wallet_transactions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id               SERIAL        PRIMARY KEY,
  tx_hash          VARCHAR(100)  NOT NULL UNIQUE,
  network          VARCHAR(20)   NOT NULL,
  coin_symbol      VARCHAR(20)   NOT NULL,
  from_address     VARCHAR(100)  NOT NULL,
  to_address       VARCHAR(100)  NOT NULL,
  amount           NUMERIC(30,8) NOT NULL,
  block_number     BIGINT,
  status           VARCHAR(30)   NOT NULL DEFAULT 'unmatched',
  order_id         UUID          REFERENCES orders(id) ON DELETE SET NULL,
  resolved_by      BIGINT,
  resolved_note    TEXT,
  refund_marked    BOOLEAN       NOT NULL DEFAULT false,
  refund_marked_by BIGINT,
  refund_note      TEXT,
  detected_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_txns_status   ON wallet_transactions (status);
CREATE INDEX IF NOT EXISTS idx_txns_amount   ON wallet_transactions (network, coin_symbol, amount);
CREATE INDEX IF NOT EXISTS idx_txns_detected ON wallet_transactions (detected_at DESC);

-- ── 6. admins ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id           SERIAL      PRIMARY KEY,
  telegram_id  BIGINT      NOT NULL UNIQUE,
  username     VARCHAR(100),
  first_name   VARCHAR(100),
  is_bootstrap BOOLEAN     NOT NULL DEFAULT false,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  added_by     BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7. admin_containers ──────────────────────────────────────
-- Stores persistent message IDs for each admin's 3 containers
CREATE TABLE IF NOT EXISTS admin_containers (
  telegram_id      BIGINT      PRIMARY KEY,
  menu_msg_id      BIGINT,     -- Container 1: Main Menu
  alerts_msg_id    BIGINT,     -- Container 2: Alerts
  orders_msg_id    BIGINT,     -- Container 3: Live Orders
  -- Notification log: last 10 alerts + last 10 order events (JSON arrays)
  alerts_log       TEXT        NOT NULL DEFAULT '[]',
  orders_log       TEXT        NOT NULL DEFAULT '[]',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── auto updated_at trigger ──────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_set_updated_at ON orders;
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
