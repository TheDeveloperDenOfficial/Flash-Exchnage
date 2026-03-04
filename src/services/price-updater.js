'use strict';
const axios = require('axios');
const { setConfig, getConfig } = require('../db');
const config = require('../config');
const logger = require('../utils/logger').child({ service: 'price-updater' });

// ── In-Memory Price Cache ────────────────────────────────────
// Shared across all modules that import this file.
// USDT is always 1:1 USD — no API call needed.
const priceCache = {
  bnb: { usd: 0, updatedAt: null },
  eth: { usd: 0, updatedAt: null },
  trx: { usd: 0, updatedAt: null },
  usdt: { usd: 1.0, updatedAt: new Date().toISOString() },
};

// CoinGecko coin IDs
const COINGECKO_IDS = {
  bnb: 'binancecoin',
  eth: 'ethereum',
  trx: 'tron',
};

/**
 * Fetch live prices from CoinGecko and update the in-memory cache.
 * Falls back to last known values (DB-persisted) if the API is unreachable.
 */
async function updatePrices() {
  const ids = Object.values(COINGECKO_IDS).join(',');

  const headers = {};
  if (config.coingeckoApiKey) {
    headers['x-cg-demo-api-key'] = config.coingeckoApiKey;
  }

  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids, vs_currencies: 'usd' },
      headers,
      timeout: 10000,
    });

    const data = response.data;
    const now = new Date().toISOString();

    for (const [coin, geckoId] of Object.entries(COINGECKO_IDS)) {
      if (data[geckoId]?.usd) {
        const newPrice = parseFloat(data[geckoId].usd);
        const oldPrice = priceCache[coin].usd;
        priceCache[coin] = { usd: newPrice, updatedAt: now };

        // Persist to DB for restart recovery
        await setConfig(`price_${coin}_usd`, newPrice);

        if (oldPrice > 0) {
          const changePct = (((newPrice - oldPrice) / oldPrice) * 100).toFixed(2);
          logger.debug(`${coin.toUpperCase()} price updated`, {
            price: newPrice,
            change: `${changePct}%`,
          });
        } else {
          logger.info(`${coin.toUpperCase()} initial price loaded`, { price: newPrice });
        }
      }
    }
  } catch (err) {
    // On failure, keep using cached values — log warning but don't crash
    if (err.response?.status === 429) {
      logger.warn('CoinGecko rate limit hit — retaining cached prices', {
        retryAfter: err.response.headers['retry-after'],
      });
    } else {
      logger.warn('CoinGecko fetch failed — retaining cached prices', {
        error: err.message,
      });
    }
  }
}

/**
 * Load persisted prices from DB on startup (avoids cold-start with zero prices).
 */
async function loadCachedPricesFromDb() {
  for (const coin of Object.keys(COINGECKO_IDS)) {
    const val = await getConfig(`price_${coin}_usd`);
    if (val && parseFloat(val) > 0) {
      priceCache[coin] = { usd: parseFloat(val), updatedAt: new Date().toISOString() };
      logger.debug(`Restored ${coin} price from DB`, { price: priceCache[coin].usd });
    }
  }
}

/**
 * Get the current USD price for a coin.
 * @param {string} coin  - 'bnb' | 'eth' | 'trx' | 'usdt'
 * @returns {number} price in USD, or 0 if not yet loaded
 */
function getPrice(coin) {
  return priceCache[coin]?.usd || 0;
}

/**
 * Validate that all prices are loaded and fresh (within 5 minutes).
 * Used by order creation to refuse orders when prices are stale.
 */
function arePricesFresh() {
  const STALE_MS = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();

  for (const [coin, data] of Object.entries(priceCache)) {
    if (coin === 'usdt') continue; // always fresh
    if (!data.updatedAt) return false;
    if (now - new Date(data.updatedAt).getTime() > STALE_MS) return false;
    if (data.usd <= 0) return false;
  }
  return true;
}

/**
 * Start the price updater daemon.
 * Loads DB cache first, does an immediate fetch, then polls every 60s.
 */
async function start() {
  await loadCachedPricesFromDb();
  await updatePrices(); // Immediate first fetch

  // Poll every 60 seconds — well within CoinGecko free tier (10 req/min)
  setInterval(async () => {
    try {
      await updatePrices();
    } catch (err) {
      logger.error('Price updater interval error', { error: err.message });
    }
  }, 60_000);

  logger.info('Price updater started', {
    bnb: priceCache.bnb.usd,
    eth: priceCache.eth.usd,
    trx: priceCache.trx.usd,
  });
}

module.exports = { start, getPrice, arePricesFresh, priceCache };
