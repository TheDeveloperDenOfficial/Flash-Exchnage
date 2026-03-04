'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../../db');
const { getPrice, arePricesFresh } = require('../../services/price-updater');
const { generateVerifiedUniqueAmount } = require('../../utils/uniqueAmount');
const config = require('../../config');
const logger = require('../../utils/logger').child({ service: 'orders-api' });

const router = express.Router();

// ── Payment method → network/coin mapping ────────────────────
const PAYMENT_METHOD_MAP = {
  'bnb':         { network: 'bsc',  coinType: 'bnb' },
  'usdt-bep20':  { network: 'bsc',  coinType: 'usdt' },
  'eth':         { network: 'eth',  coinType: 'eth' },
  'usdt-erc20':  { network: 'eth',  coinType: 'usdt' },
  'trx':         { network: 'tron', coinType: 'trx' },
  'usdt-trc20':  { network: 'tron', coinType: 'usdt' },
};

// Minimum order in USD ($1)
const MIN_ORDER_USD = 1;
// Maximum order in USD ($50,000)
const MAX_ORDER_USD = 50_000;

// ── POST /api/order ──────────────────────────────────────────
/**
 * Create a new purchase order.
 *
 * Request body:
 *   { usdt_amount: number, payment_method: string, receiving_wallet: string }
 *
 * Response:
 *   { orderId, paymentAddress, uniqueCryptoAmount, coinSymbol, network,
 *     tokenAmount, expiresAt, usdtAmount, coinPriceUsd }
 */
router.post('/', async (req, res) => {
  try {
    const { usdt_amount, payment_method, receiving_wallet } = req.body;

    // ── Input Validation ────────────────────────────────
    const errors = [];

    const usdtAmount = parseFloat(usdt_amount);
    if (!usdt_amount || isNaN(usdtAmount) || usdtAmount < MIN_ORDER_USD) {
      errors.push(`usdt_amount must be a number ≥ ${MIN_ORDER_USD}`);
    }
    if (usdtAmount > MAX_ORDER_USD) {
      errors.push(`usdt_amount must be ≤ ${MAX_ORDER_USD}`);
    }

    const paymentMethodData = PAYMENT_METHOD_MAP[payment_method?.toLowerCase()];
    if (!paymentMethodData) {
      errors.push(`payment_method must be one of: ${Object.keys(PAYMENT_METHOD_MAP).join(', ')}`);
    }

    if (!receiving_wallet || typeof receiving_wallet !== 'string') {
      errors.push('receiving_wallet is required');
    } else if (receiving_wallet.trim().length < 20) {
      errors.push('receiving_wallet appears invalid (too short)');
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { network, coinType } = paymentMethodData;

    // ── Price Check ─────────────────────────────────────
    if (!arePricesFresh() && coinType !== 'usdt') {
      return res.status(503).json({
        error: 'Price data is temporarily unavailable. Please try again in a moment.',
      });
    }

    const coinPriceUsd = getPrice(coinType);

    if (coinPriceUsd <= 0 && coinType !== 'usdt') {
      return res.status(503).json({
        error: `Live price for ${coinType.toUpperCase()} is not available yet. Please try again.`,
      });
    }

    // ── Payment Address ─────────────────────────────────
    const paymentAddress = config.getPaymentAddress(network);
    if (!paymentAddress) {
      logger.error('Payment address not configured for network', { network });
      return res.status(500).json({ error: 'Payment address not configured for this network.' });
    }

    // ── Amount Calculation ───────────────────────────────
    // For USDT payments, price is always 1:1 (coinPriceUsd = 1)
    const effectivePrice = coinType === 'usdt' ? 1.0 : coinPriceUsd;

    // Base crypto amount: how much of the selected coin equals usdtAmount USD
    const cryptoAmount = usdtAmount / effectivePrice;

    // Token amount: how many FLASH tokens the buyer receives
    const tokenAmount = usdtAmount / config.tokenPriceUsd;

    // Generate unique fingerprinted amount (with DB collision check)
    const { uniqueAmount: uniqueCryptoAmount, fingerprint } =
      await generateVerifiedUniqueAmount(pool, cryptoAmount, network, coinType);

    // ── Order Expiry ─────────────────────────────────────
    const expiresAt = new Date(Date.now() + config.orderExpiryMinutes * 60 * 1000);

    // ── Persist Order ────────────────────────────────────
    const { rows } = await pool.query(
      `INSERT INTO orders (
         payment_method, network, coin_type,
         usdt_amount, token_amount, crypto_amount, unique_crypto_amount,
         coin_price_usd, fingerprint,
         payment_address, receiving_wallet,
         expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, expires_at, created_at`,
      [
        payment_method.toLowerCase(),
        network,
        coinType,
        usdtAmount.toFixed(8),
        tokenAmount.toFixed(8),
        cryptoAmount.toFixed(8),
        uniqueCryptoAmount.toFixed(8),
        effectivePrice.toFixed(8),
        fingerprint,
        paymentAddress,
        receiving_wallet.trim(),
        expiresAt.toISOString(),
      ]
    );

    const order = rows[0];

    logger.info('Order created', {
      orderId: order.id,
      network,
      coin: coinType,
      usdtAmount,
      uniqueAmount: uniqueCryptoAmount,
      tokens: tokenAmount,
      fingerprint,
    });

    // ── Response ─────────────────────────────────────────
    const coinSymbols = {
      bnb: 'BNB', eth: 'ETH', trx: 'TRX', usdt: 'USDT',
    };

    return res.status(201).json({
      orderId: order.id,
      paymentAddress,
      uniqueCryptoAmount: uniqueCryptoAmount.toFixed(8),
      coinSymbol: coinSymbols[coinType] || coinType.toUpperCase(),
      coinType,
      network,
      networkLabel: network.toUpperCase(),
      tokenAmount: parseFloat(tokenAmount.toFixed(2)),
      tokenSymbol: config.tokenSymbol,
      usdtAmount: parseFloat(usdtAmount.toFixed(2)),
      coinPriceUsd: effectivePrice,
      expiresAt: order.expires_at,
      createdAt: order.created_at,
      expiryMinutes: config.orderExpiryMinutes,
      // Human-readable payment instruction
      instruction: `Send exactly ${uniqueCryptoAmount.toFixed(8)} ${coinSymbols[coinType]} to ${paymentAddress}`,
    });

  } catch (err) {
    logger.error('POST /api/order error', { error: err.message, stack: err.stack });
    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// ── GET /api/order/:id ───────────────────────────────────────
/**
 * Get the live status of an order.
 * Polled by the frontend every ~5 seconds.
 *
 * Response includes a sanitised view (no private keys, no internal fields).
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: 'Invalid order ID format' });
    }

    const { rows } = await pool.query(
      `SELECT
         id, status, payment_method, network, coin_type,
         usdt_amount, token_amount, unique_crypto_amount,
         coin_price_usd, payment_address, receiving_wallet,
         tx_hash_in, tx_hash_out,
         matched_at, completed_at, expires_at, created_at
       FROM orders
       WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = rows[0];

    // Auto-expire orders that have passed their expiry without payment
    if (
      order.status === 'waiting_payment' &&
      new Date() > new Date(order.expires_at)
    ) {
      await pool.query(
        `UPDATE orders SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [id]
      );
      order.status = 'expired';
    }

    // Compute time remaining
    const msRemaining = Math.max(0, new Date(order.expires_at) - Date.now());
    const minutesRemaining = Math.floor(msRemaining / 60000);
    const secondsRemaining = Math.floor((msRemaining % 60000) / 1000);

    const coinSymbols = { bnb: 'BNB', eth: 'ETH', trx: 'TRX', usdt: 'USDT' };

    return res.json({
      orderId: order.id,
      status: order.status,
      paymentMethod: order.payment_method,
      network: order.network,
      coinType: order.coin_type,
      coinSymbol: coinSymbols[order.coin_type] || order.coin_type.toUpperCase(),
      usdtAmount: parseFloat(order.usdt_amount),
      tokenAmount: parseFloat(order.token_amount),
      tokenSymbol: config.tokenSymbol,
      uniqueCryptoAmount: order.unique_crypto_amount,
      paymentAddress: order.payment_address,
      receivingWallet: order.receiving_wallet,
      txHashIn: order.tx_hash_in || null,
      txHashOut: order.tx_hash_out || null,
      matchedAt: order.matched_at || null,
      completedAt: order.completed_at || null,
      expiresAt: order.expires_at,
      createdAt: order.created_at,
      timeRemaining: {
        ms: msRemaining,
        minutes: minutesRemaining,
        seconds: secondsRemaining,
        display: `${String(minutesRemaining).padStart(2, '0')}:${String(secondsRemaining).padStart(2, '0')}`,
      },
    });

  } catch (err) {
    logger.error('GET /api/order/:id error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
