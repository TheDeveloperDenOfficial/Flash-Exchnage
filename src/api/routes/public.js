'use strict';
const express = require('express');
const { pool, getSetting } = require('../../db');
const { getPrice } = require('../../services/price-updater');
const router = express.Router();

const ICON_CDN = 'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color';

// ── GET /api/config ───────────────────────────────────────────
// Called once on page load. Returns everything the frontend needs.
router.get('/config', async (_req, res) => {
  try {
    const [tokenPrice, tokenSymbol, minOrderQty] = await Promise.all([
      getSetting('token_price_usd'),
      getSetting('token_symbol'),
      getSetting('min_order_qty'),
    ]);

    const { rows: methods } = await pool.query(
      `SELECT name, code, network, coin_symbol
       FROM payment_methods
       WHERE is_active = true
       ORDER BY name ASC`
    );

    // Only return methods that have an active wallet configured
    const { rows: wallets } = await pool.query(
      `SELECT payment_method_code FROM payment_wallets WHERE is_active = true`
    );
    const walletCodes = new Set(wallets.map(w => w.payment_method_code));

    const activeMethods = methods
      .filter(m => walletCodes.has(m.code))
      .map(m => ({
        code:       m.code,
        name:       m.name,
        network:    m.network,
        coinSymbol: m.coin_symbol,
        iconUrl:    `${ICON_CDN}/${m.coin_symbol.toLowerCase()}.svg`,
      }));

    return res.json({
      tokenPriceUsd:  parseFloat(tokenPrice) || 0.02,
      tokenSymbol:    tokenSymbol || 'FLASH',
      minOrderQty:    parseInt(minOrderQty, 10) || 100,
      paymentMethods: activeMethods,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Could not load configuration' });
  }
});

// ── GET /api/order/lookup?wallet=0x... ────────────────────────
// Returns the most recent active pending order for a wallet address.
router.get('/order/lookup', async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet || wallet.trim().length < 20) {
      return res.status(400).json({ error: 'Valid wallet address required' });
    }

    const { rows } = await pool.query(
      `SELECT id, status, payment_method_code, network, coin_symbol,
              usdt_amount, token_amount, unique_crypto_amount,
              payment_address, receiving_wallet, expires_at, created_at
       FROM orders
       WHERE receiving_wallet ILIKE $1
         AND status = 'waiting_payment'
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [wallet.trim()]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'No active order found for this wallet address' });
    }

    const order = rows[0];
    const msRemaining = Math.max(0, new Date(order.expires_at) - Date.now());

    return res.json({
      orderId:            order.id,
      status:             order.status,
      paymentMethodCode:  order.payment_method_code,
      network:            order.network,
      coinSymbol:         order.coin_symbol,
      usdtAmount:         parseFloat(order.usdt_amount),
      tokenAmount:        parseFloat(order.token_amount),
      uniqueCryptoAmount: order.unique_crypto_amount,
      paymentAddress:     order.payment_address,
      receivingWallet:    order.receiving_wallet,
      expiresAt:          order.expires_at,
      createdAt:          order.created_at,
      msRemaining,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Lookup failed' });
  }
});

module.exports = router;
