'use strict';
const { ethers } = require('ethers');
const axios = require('axios');
const { pool, getSetting, setSetting } = require('../db');
const { runMatchingCycle } = require('./matching-engine');
const config = require('../config');
const logger = require('../utils/logger').child({ service: 'scanner' });

const TRANSFER_ABI = ['event Transfer(address indexed from, address indexed to, uint256 value)'];
const MAX_BLOCKS   = 50;

let bscProvider = null;
let ethProvider = null;

function getBscProvider() {
  if (!bscProvider) bscProvider = new ethers.providers.FallbackProvider([
    { provider: new ethers.providers.JsonRpcProvider(config.bscRpcUrl),         priority: 1, stallTimeout: 5000 },
    { provider: new ethers.providers.JsonRpcProvider(config.bscRpcUrlFallback), priority: 2, stallTimeout: 7000 },
  ]);
  return bscProvider;
}

function getEthProvider() {
  if (!ethProvider) ethProvider = new ethers.providers.FallbackProvider([
    { provider: new ethers.providers.JsonRpcProvider(config.ethRpcUrl),         priority: 1, stallTimeout: 5000 },
    { provider: new ethers.providers.JsonRpcProvider(config.ethRpcUrlFallback), priority: 2, stallTimeout: 7000 },
  ]);
  return ethProvider;
}

// ── Save detected transaction ─────────────────────────────────
async function saveTx(tx) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO wallet_transactions (tx_hash, network, coin_symbol, from_address, to_address, amount, block_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tx_hash) DO NOTHING
       RETURNING id`,
      [tx.txHash, tx.network, tx.coinSymbol, tx.from.toLowerCase(), tx.to.toLowerCase(),
       tx.amount.toFixed(8), tx.blockNumber || null]
    );
    if (rows.length > 0) {
      logger.info('New TX detected', { network: tx.network, coin: tx.coinSymbol, amount: tx.amount, hash: tx.txHash });
    }
  } catch (err) {
    logger.error('saveTx error', { error: err.message, hash: tx.txHash });
  }
}

// ── Get active payment wallets from DB ────────────────────────
async function getActiveWallets() {
  const { rows } = await pool.query(
    `SELECT pw.network, pw.address, pm.coin_symbol, pm.code
     FROM payment_wallets pw
     JOIN payment_methods pm ON pw.payment_method_code = pm.code
     WHERE pw.is_active = true AND pm.is_active = true`
  );
  return rows;
}

// ── BSC Scanner ───────────────────────────────────────────────
async function scanBsc(wallets) {
  const provider = getBscProvider();
  const latest   = await provider.getBlockNumber();
  const stored   = parseInt(await getSetting('last_bsc_block') || '0', 10);
  const from     = stored === 0 ? latest - 10 : stored + 1;
  if (from > latest) return;
  const to       = Math.min(from + MAX_BLOCKS - 1, latest);

  // USDT-BEP20 transfers (getLogs — efficient)
  const bscWallet = wallets.find(w => w.network === 'bsc' && w.coin_symbol === 'USDT');
  if (bscWallet) {
    try {
      const contract = new ethers.Contract(config.usdtBep20Contract, TRANSFER_ABI, provider);
      const filter   = contract.filters.Transfer(null, ethers.utils.getAddress(bscWallet.address));
      const events   = await contract.queryFilter(filter, from, to);
      for (const ev of events) {
        await saveTx({
          txHash: ev.transactionHash, network: 'bsc', coinSymbol: 'USDT',
          from: ev.args.from, to: ev.args.to,
          amount: parseFloat(ethers.utils.formatUnits(ev.args.value, config.usdtDecimals.bsc)),
          blockNumber: ev.blockNumber,
        });
      }
    } catch (err) { logger.warn('BSC USDT scan failed', { error: err.message }); }
  }

  // Native BNB (scan blocks)
  const bnbWallet = wallets.find(w => w.network === 'bsc' && w.coin_symbol === 'BNB');
  if (bnbWallet) {
    for (let b = from; b <= to; b++) {
      try {
        const block = await provider.getBlockWithTransactions(b);
        if (!block) continue;
        for (const tx of block.transactions) {
          if (tx.to?.toLowerCase() === bnbWallet.address.toLowerCase() && !tx.value.isZero()) {
            await saveTx({
              txHash: tx.hash, network: 'bsc', coinSymbol: 'BNB',
              from: tx.from, to: tx.to,
              amount: parseFloat(ethers.utils.formatEther(tx.value)),
              blockNumber: b,
            });
          }
        }
      } catch (err) { logger.warn(`BSC block ${b} failed`, { error: err.message }); }
    }
  }

  await setSetting('last_bsc_block', to);
  logger.debug('BSC scan complete', { from, to });
}

// ── ETH Scanner ───────────────────────────────────────────────
async function scanEth(wallets) {
  const provider = getEthProvider();
  const latest   = await provider.getBlockNumber();
  const stored   = parseInt(await getSetting('last_eth_block') || '0', 10);
  const from     = stored === 0 ? latest - 10 : stored + 1;
  if (from > latest) return;
  const to       = Math.min(from + MAX_BLOCKS - 1, latest);

  // USDT-ERC20
  const ethUsdtWallet = wallets.find(w => w.network === 'eth' && w.coin_symbol === 'USDT');
  if (ethUsdtWallet) {
    try {
      const contract = new ethers.Contract(config.usdtErc20Contract, TRANSFER_ABI, provider);
      const filter   = contract.filters.Transfer(null, ethers.utils.getAddress(ethUsdtWallet.address));
      const events   = await contract.queryFilter(filter, from, to);
      for (const ev of events) {
        await saveTx({
          txHash: ev.transactionHash, network: 'eth', coinSymbol: 'USDT',
          from: ev.args.from, to: ev.args.to,
          amount: parseFloat(ethers.utils.formatUnits(ev.args.value, config.usdtDecimals.eth)),
          blockNumber: ev.blockNumber,
        });
      }
    } catch (err) { logger.warn('ETH USDT scan failed', { error: err.message }); }
  }

  // Native ETH
  const ethWallet = wallets.find(w => w.network === 'eth' && w.coin_symbol === 'ETH');
  if (ethWallet) {
    for (let b = from; b <= to; b++) {
      try {
        const block = await provider.getBlockWithTransactions(b);
        if (!block) continue;
        for (const tx of block.transactions) {
          if (tx.to?.toLowerCase() === ethWallet.address.toLowerCase()
              && !tx.value.isZero() && (!tx.data || tx.data === '0x')) {
            await saveTx({
              txHash: tx.hash, network: 'eth', coinSymbol: 'ETH',
              from: tx.from, to: tx.to,
              amount: parseFloat(ethers.utils.formatEther(tx.value)),
              blockNumber: b,
            });
          }
        }
      } catch (err) { logger.warn(`ETH block ${b} failed`, { error: err.message }); }
    }
  }

  await setSetting('last_eth_block', to);
  logger.debug('ETH scan complete', { from, to });
}

// ── Tron Scanner ──────────────────────────────────────────────
async function scanTron(wallets) {
  const tronWallet     = wallets.find(w => w.network === 'tron' && w.coin_symbol === 'TRX');
  const tronUsdtWallet = wallets.find(w => w.network === 'tron' && w.coin_symbol === 'USDT');
  if (!tronWallet && !tronUsdtWallet) return;

  const base    = 'https://api.trongrid.io/v1';
  const headers = config.trongridApiKey ? { 'TRON-PRO-API-KEY': config.trongridApiKey } : {};
  const lastTs  = parseInt(await getSetting('last_tron_ts') || '0', 10);
  const nowTs   = Date.now();
  const minTs   = lastTs > 0 ? lastTs + 1 : nowTs - 300_000;

  // TRC20 USDT
  if (tronUsdtWallet) {
    try {
      const { data } = await axios.get(`${base}/accounts/${tronUsdtWallet.address}/transactions/trc20`, {
        headers, timeout: 10_000,
        params: { limit: 50, order_by: 'block_timestamp,asc', min_timestamp: minTs, max_timestamp: nowTs, contract_address: config.usdtTrc20Contract },
      });
      for (const t of (data?.data || [])) {
        if (t.to !== tronUsdtWallet.address) continue;
        await saveTx({
          txHash: t.transaction_id, network: 'tron', coinSymbol: 'USDT',
          from: t.from, to: t.to,
          amount: parseFloat(t.value) / Math.pow(10, config.usdtDecimals.tron),
          blockNumber: null,
        });
      }
    } catch (err) { logger.warn('Tron USDT scan failed', { error: err.message }); }
  }

  // Native TRX
  if (tronWallet) {
    try {
      const { data } = await axios.get(`${base}/accounts/${tronWallet.address}/transactions`, {
        headers, timeout: 10_000,
        params: { limit: 50, order_by: 'block_timestamp,asc', min_timestamp: minTs, max_timestamp: nowTs, only_to: true },
      });
      for (const t of (data?.data || [])) {
        const contract = t.raw_data?.contract?.[0];
        if (contract?.type !== 'TransferContract') continue;
        const val = contract.parameter?.value;
        if (!val) continue;
        await saveTx({
          txHash: t.txID, network: 'tron', coinSymbol: 'TRX',
          from: val.owner_address || 'unknown', to: tronWallet.address,
          amount: parseFloat(val.amount) / 1_000_000,
          blockNumber: null,
        });
      }
    } catch (err) { logger.warn('Tron TRX scan failed', { error: err.message }); }
  }

  await setSetting('last_tron_ts', nowTs);
}

// ── Main cycle ────────────────────────────────────────────────
async function runScanCycle() {
  const wallets = await getActiveWallets();
  if (!wallets.length) { logger.debug('No active wallets configured — skipping scan'); return; }

  const results = await Promise.allSettled([scanBsc(wallets), scanEth(wallets), scanTron(wallets)]);
  results.forEach((r, i) => {
    if (r.status === 'rejected') logger.error(`Scan failed`, { chain: ['BSC','ETH','Tron'][i], error: r.reason?.message });
  });

  await runMatchingCycle();
}

async function start() {
  logger.info('Blockchain scanner starting…');
  try { await runScanCycle(); } catch (err) { logger.error('Initial scan failed', { error: err.message }); }
  setInterval(async () => {
    try { await runScanCycle(); } catch (err) { logger.error('Scan interval error', { error: err.message }); }
  }, 20_000);
  logger.info('Blockchain scanner active — polling every 20s');
}

module.exports = { start };
