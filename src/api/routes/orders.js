'use strict';
const express = require('express');
const { pool, getSetting } = require('../../db');
const { getPrice, arePricesFresh } = require('../../services/price-updater');
const { generateVerifiedUniqueAmount } = require('../../utils/uniqueAmount');
const { validateBep20Wallet } = require('../../utils/validators');
const { generateQRDataUrl } = require('../../utils/qr');
const logger = require('../../utils/logger').child({ service: 'orders-api' });

const router = express.Router();

// ── POST /api/order ───────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { quantity, payment_method_code, receiving_wallet } = req.body;

    // ── Validation ──────────────────────────────────────
    const errors = [];
    const qty = parseInt(quantity, 10);

    const [minQtyStr, tokenPriceStr, expiryStr] = await Promise.all([
      getSetting('min_order_qty'),
      getSetting('token_price_usd'),
      getSetting('order_expiry_minutes'),
    ]);
    const minQty       = parseInt(minQtyStr, 10) || 100;
    const tokenPrice   = parseFloat(tokenPriceStr) || 0.02;
    const expiryMins   = parseInt(expiryStr, 10) || 30;

    if (!qty || isNaN(qty) || qty < minQty) {
      errors.push(`Minimum quantity is ${minQty} tokens`);
    }
    if (!payment_method_code) {
      errors.push('Payment method is required');
    }
    if (!receiving_wallet) {
      errors.push('Receiving wallet is required');
    }
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });

    // ── Validate wallet ─────────────────────────────────
    const walletCheck = await validateBep20Wallet(receiving_wallet);
    if (!walletCheck.valid) {
      return res.status(400).json({ error: walletCheck.reason });
    }

    // ── Payment method + wallet ─────────────────────────
    const { rows: methodRows } = await pool.query(
      `SELECT pm.*, pw.address AS payment_address
       FROM payment_methods pm
       JOIN payment_wallets pw ON pm.code = pw.payment_method_code
       WHERE pm.code = $1 AND pm.is_active = true AND pw.is_active = true`,
      [payment_method_code]
    );

    if (!methodRows.length) {
      return res.status(400).json({ error: 'Selected payment method is not available' });
    }

    const method         = methodRows[0];
    const paymentAddress = method.payment_address;
    const network        = method.network;
    const coinSymbol     = method.coin_symbol;
    const isUsdt         = coinSymbol === 'USDT';

    // ── Price ───────────────────────────────────────────
    if (!isUsdt && !arePricesFresh()) {
      return res.status(503).json({ error: 'Live price data is temporarily unavailable. Please try again in a moment.' });
    }

    const coinPriceUsd = isUsdt ? 1.0 : getPrice(coinSymbol);
    if (coinPriceUsd <= 0) {
      return res.status(503).json({ error: `Price for ${coinSymbol} is not available yet` });
    }

    // ── Calculate amounts ───────────────────────────────
    const usdtAmount   = qty * tokenPrice;
    const cryptoAmount = usdtAmount / coinPriceUsd;
    const { uniqueAmount, fingerprint } = await generateVerifiedUniqueAmount(
      pool, cryptoAmount, network, coinSymbol
    );

    const expiresAt = new Date(Date.now() + expiryMins * 60 * 1000);

    // ── Create order ────────────────────────────────────
    const { rows } = await pool.query(
      `INSERT INTO orders
         (payment_method_code, network, coin_symbol,
          usdt_amount, token_amount, token_price_snapshot,
          crypto_amount, unique_crypto_amount, coin_price_usd_snapshot,
          fingerprint, payment_address, receiving_wallet, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, expires_at, created_at`,
      [
        payment_method_code, network, coinSymbol,
        usdtAmount.toFixed(8), qty.toFixed(8), tokenPrice.toFixed(8),
        cryptoAmount.toFixed(8), uniqueAmount.toFixed(8), coinPriceUsd.toFixed(8),
        fingerprint, paymentAddress, receiving_wallet.trim(), expiresAt.toISOString(),
      ]
    );

    const order = rows[0];

    // Generate QR for frontend
    const qrDataUrl = await generateQRDataUrl(paymentAddress);

    logger.info('Order created', {
      orderId: order.id, network, coin: coinSymbol, qty, usdtAmount, uniqueAmount, fingerprint,
    });

    // Notify admins of new order
    const notify = require('../../bot/notify');
    notify.newOrder({ id: order.id, token_amount: qty, usdt_amount: usdtAmount, payment_method_code, receiving_wallet });

    return res.status(201).json({
      orderId:            order.id,
      paymentAddress,
      qrDataUrl,
      uniqueCryptoAmount: uniqueAmount.toFixed(8),
      coinSymbol,
      network,
      tokenAmount:        qty,
      usdtAmount:         parseFloat(usdtAmount.toFixed(2)),
      expiresAt:          order.expires_at,
      createdAt:          order.created_at,
      expiryMinutes:      expiryMins,
    });

  } catch (err) {
    logger.error('POST /api/order error', { error: err.message });
    return res.status(500).json({ error: 'Order creation failed. Please try again.' });
  }
});

// ── GET /api/order/:id ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const { rows } = await pool.query(
      `SELECT id, status, payment_method_code, network, coin_symbol,
              usdt_amount, token_amount, unique_crypto_amount, payment_address,
              receiving_wallet, tx_hash_in, tx_hash_out, retry_count,
              matched_at, completed_at, expires_at, created_at
       FROM orders WHERE id=$1`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Order not found' });

    const order = rows[0];

    // Auto-expire
    if (order.status === 'waiting_payment' && new Date() > new Date(order.expires_at)) {
      await pool.query(`UPDATE orders SET status='expired', updated_at=NOW() WHERE id=$1`, [id]);
      order.status = 'expired';
    }

    const msRemaining = Math.max(0, new Date(order.expires_at) - Date.now());
    const mins = Math.floor(msRemaining / 60000);
    const secs = Math.floor((msRemaining % 60000) / 1000);

    // Explorer links
    const explorers = { bsc: 'https://bscscan.com/tx/', eth: 'https://etherscan.io/tx/', tron: 'https://tronscan.org/#/transaction/' };
    const explorer  = explorers[order.network] || explorers.bsc;

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
      txHashIn:           order.tx_hash_in  ? { hash: order.tx_hash_in,  url: explorer + order.tx_hash_in  } : null,
      txHashOut:          order.tx_hash_out ? { hash: order.tx_hash_out, url: explorer + order.tx_hash_out } : null,
      retryCount:         order.retry_count,
      matchedAt:          order.matched_at,
      completedAt:        order.completed_at,
      expiresAt:          order.expires_at,
      createdAt:          order.created_at,
      timeRemaining:      { ms: msRemaining, display: `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}` },
    });

  } catch (err) {
    logger.error('GET /api/order/:id error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
