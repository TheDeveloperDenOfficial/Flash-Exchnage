'use strict';
const axios = require('axios');
const { getSetting, setSetting } = require('../db');
const config = require('../config');
const logger = require('../utils/logger').child({ service: 'price-updater' });

// In-memory cache — zero latency reads for order creation
const priceCache = {
  bnb:  { usd: 0, updatedAt: null },
  eth:  { usd: 0, updatedAt: null },
  trx:  { usd: 0, updatedAt: null },
  usdt: { usd: 1.0, updatedAt: new Date().toISOString() },
};

const GECKO_IDS = { bnb: 'binancecoin', eth: 'ethereum', trx: 'tron' };

async function fetchPrices() {
  const ids  = Object.values(GECKO_IDS).join(',');
  const hdrs = config.coingeckoApiKey ? { 'x-cg-demo-api-key': config.coingeckoApiKey } : {};

  try {
    const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids, vs_currencies: 'usd' },
      headers: hdrs,
      timeout: 10000,
    });

    const now = new Date().toISOString();
    for (const [coin, geckoId] of Object.entries(GECKO_IDS)) {
      if (data[geckoId]?.usd) {
        priceCache[coin] = { usd: parseFloat(data[geckoId].usd), updatedAt: now };
        await setSetting(`price_${coin}_usd`, priceCache[coin].usd);
        logger.debug(`${coin.toUpperCase()} = $${priceCache[coin].usd}`);
      }
    }
  } catch (err) {
    const msg = err.response?.status === 429 ? 'Rate limited' : err.message;
    logger.warn('Price fetch failed — using cached values', { reason: msg });
  }
}

async function loadFromDb() {
  for (const coin of Object.keys(GECKO_IDS)) {
    const val = await getSetting(`price_${coin}_usd`);
    if (val && parseFloat(val) > 0) {
      priceCache[coin] = { usd: parseFloat(val), updatedAt: new Date().toISOString() };
    }
  }
}

function getPrice(coinSymbol) {
  return priceCache[coinSymbol.toLowerCase()]?.usd || 0;
}

function arePricesFresh() {
  const STALE = 5 * 60 * 1000;
  for (const [coin, data] of Object.entries(priceCache)) {
    if (coin === 'usdt') continue;
    if (!data.updatedAt || Date.now() - new Date(data.updatedAt).getTime() > STALE) return false;
    if (data.usd <= 0) return false;
  }
  return true;
}

async function start() {
  await loadFromDb();
  await fetchPrices();
  setInterval(async () => {
    try { await fetchPrices(); } catch (e) { logger.error('Price interval error', { error: e.message }); }
  }, 60_000);
  logger.info('Price updater started', { bnb: priceCache.bnb.usd, eth: priceCache.eth.usd, trx: priceCache.trx.usd });
}

module.exports = { start, getPrice, arePricesFresh, priceCache };
