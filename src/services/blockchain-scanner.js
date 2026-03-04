'use strict';
const { ethers } = require('ethers');
const axios = require('axios');
const { pool, getConfig, setConfig } = require('../db');
const { runMatchingCycle } = require('./matching-engine');
const config = require('../config');
const logger = require('../utils/logger').child({ service: 'scanner' });

// ── EVM Provider setup ───────────────────────────────────────
// Create providers with automatic fallback to secondary RPC on failure

function createProvider(primaryUrl, fallbackUrl) {
  return new ethers.providers.FallbackProvider([
    { provider: new ethers.providers.JsonRpcProvider(primaryUrl), priority: 1, stallTimeout: 5000 },
    { provider: new ethers.providers.JsonRpcProvider(fallbackUrl), priority: 2, stallTimeout: 7000 },
  ]);
}

let bscProvider;
let ethProvider;

// Minimal Transfer event ABI for USDT
const TRANSFER_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

// Maximum blocks to scan per cycle (prevents RPC overload on first start/gap)
const MAX_BLOCKS_PER_CYCLE = 50;

// ── Transaction Persistence ──────────────────────────────────

/**
 * Save a detected transaction to wallet_transactions.
 * UPSERT on tx_hash — safe to call multiple times for the same tx.
 *
 * @param {object} tx
 */
async function saveTx(tx) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO wallet_transactions
         (tx_hash, network, coin_type, from_address, to_address, amount, block_number, raw_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tx_hash) DO NOTHING
       RETURNING id`,
      [
        tx.txHash,
        tx.network,
        tx.coinType,
        tx.fromAddress.toLowerCase(),
        tx.toAddress.toLowerCase(),
        tx.amount.toFixed(8),
        tx.blockNumber || null,
        JSON.stringify(tx.raw || {}),
      ]
    );

    if (rows.length > 0) {
      logger.info('New transaction detected', {
        network: tx.network,
        coin: tx.coinType,
        amount: tx.amount,
        txHash: tx.txHash,
        from: tx.fromAddress,
      });
    }
  } catch (err) {
    logger.error('saveTx error', { error: err.message, txHash: tx.txHash });
  }
}

// ── BSC Scanner ──────────────────────────────────────────────

async function scanBsc() {
  if (!bscProvider) {
    bscProvider = createProvider(config.bscRpcUrl, config.bscRpcUrlFallback);
  }

  const paymentAddr = config.bscPaymentAddress?.toLowerCase();
  if (!paymentAddr) return;

  const latestBlock = await bscProvider.getBlockNumber();
  const storedBlock = parseInt(await getConfig('last_bsc_block') || '0', 10);

  // On first run, start from current block - 10 to catch very recent txs
  const fromBlock = storedBlock === 0 ? latestBlock - 10 : storedBlock + 1;

  if (fromBlock > latestBlock) return; // Nothing new

  const toBlock = Math.min(fromBlock + MAX_BLOCKS_PER_CYCLE - 1, latestBlock);

  logger.debug('Scanning BSC', { fromBlock, toBlock, gap: toBlock - fromBlock + 1 });

  // ── 1. USDT-BEP20 Transfer events (efficient getLogs) ──
  const usdtContract = new ethers.Contract(config.usdtBep20Contract, TRANSFER_ABI, bscProvider);

  try {
    const filter = usdtContract.filters.Transfer(null, ethers.utils.getAddress(config.bscPaymentAddress));
    const events = await usdtContract.queryFilter(filter, fromBlock, toBlock);

    for (const ev of events) {
      const amount = parseFloat(ethers.utils.formatUnits(ev.args.value, config.usdtDecimals.bsc));
      await saveTx({
        txHash: ev.transactionHash,
        network: 'bsc',
        coinType: 'usdt',
        fromAddress: ev.args.from,
        toAddress: ev.args.to,
        amount,
        blockNumber: ev.blockNumber,
        raw: { logIndex: ev.logIndex },
      });
    }
  } catch (err) {
    logger.warn('BSC USDT getLogs failed', { error: err.message });
  }

  // ── 2. Native BNB transfers (scan each block) ──
  for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
    try {
      const block = await bscProvider.getBlockWithTransactions(blockNum);
      if (!block) continue;

      for (const tx of block.transactions) {
        if (
          tx.to &&
          tx.to.toLowerCase() === paymentAddr &&
          tx.value &&
          !tx.value.isZero()
        ) {
          const amount = parseFloat(ethers.utils.formatEther(tx.value));
          await saveTx({
            txHash: tx.hash,
            network: 'bsc',
            coinType: 'bnb',
            fromAddress: tx.from,
            toAddress: tx.to,
            amount,
            blockNumber: blockNum,
            raw: { gasPrice: tx.gasPrice?.toString() },
          });
        }
      }
    } catch (err) {
      logger.warn(`BSC block ${blockNum} scan failed`, { error: err.message });
    }
  }

  await setConfig('last_bsc_block', toBlock);
}

// ── ETH Scanner ──────────────────────────────────────────────

async function scanEth() {
  if (!ethProvider) {
    ethProvider = createProvider(config.ethRpcUrl, config.ethRpcUrlFallback);
  }

  const paymentAddr = config.ethPaymentAddress?.toLowerCase();
  if (!paymentAddr) return;

  const latestBlock = await ethProvider.getBlockNumber();
  const storedBlock = parseInt(await getConfig('last_eth_block') || '0', 10);

  const fromBlock = storedBlock === 0 ? latestBlock - 10 : storedBlock + 1;
  if (fromBlock > latestBlock) return;

  const toBlock = Math.min(fromBlock + MAX_BLOCKS_PER_CYCLE - 1, latestBlock);

  logger.debug('Scanning ETH', { fromBlock, toBlock, gap: toBlock - fromBlock + 1 });

  // ── 1. USDT-ERC20 Transfer events ──
  const usdtContract = new ethers.Contract(config.usdtErc20Contract, TRANSFER_ABI, ethProvider);

  try {
    const filter = usdtContract.filters.Transfer(null, ethers.utils.getAddress(config.ethPaymentAddress));
    const events = await usdtContract.queryFilter(filter, fromBlock, toBlock);

    for (const ev of events) {
      const amount = parseFloat(ethers.utils.formatUnits(ev.args.value, config.usdtDecimals.eth));
      await saveTx({
        txHash: ev.transactionHash,
        network: 'eth',
        coinType: 'usdt',
        fromAddress: ev.args.from,
        toAddress: ev.args.to,
        amount,
        blockNumber: ev.blockNumber,
        raw: {},
      });
    }
  } catch (err) {
    logger.warn('ETH USDT getLogs failed', { error: err.message });
  }

  // ── 2. Native ETH transfers ──
  for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
    try {
      const block = await ethProvider.getBlockWithTransactions(blockNum);
      if (!block) continue;

      for (const tx of block.transactions) {
        if (
          tx.to &&
          tx.to.toLowerCase() === paymentAddr &&
          tx.value &&
          !tx.value.isZero() &&
          (!tx.data || tx.data === '0x') // Pure ETH transfer, not a contract call
        ) {
          const amount = parseFloat(ethers.utils.formatEther(tx.value));
          await saveTx({
            txHash: tx.hash,
            network: 'eth',
            coinType: 'eth',
            fromAddress: tx.from,
            toAddress: tx.to,
            amount,
            blockNumber: blockNum,
            raw: {},
          });
        }
      }
    } catch (err) {
      logger.warn(`ETH block ${blockNum} scan failed`, { error: err.message });
    }
  }

  await setConfig('last_eth_block', toBlock);
}

// ── Tron Scanner ─────────────────────────────────────────────

/**
 * Tron scanning uses TronGrid REST API (no ethers.js — different VM).
 * We use a timestamp cursor stored in config to avoid re-processing old txs.
 * TronGrid docs: https://developers.tron.network/reference/get-transaction-list
 */
async function scanTron() {
  const paymentAddr = config.tronPaymentAddress;
  if (!paymentAddr) return;

  const tronGridBase = 'https://api.trongrid.io/v1';
  const headers = config.trongridApiKey
    ? { 'TRON-PRO-API-KEY': config.trongridApiKey }
    : {};

  // Timestamp cursor: only fetch transactions newer than this (ms)
  const lastTs = parseInt(await getConfig('last_tron_ts') || '0', 10);
  const newTs = Date.now();

  const queryParams = {
    limit: 50,
    order_by: 'block_timestamp,asc',
    min_timestamp: lastTs > 0 ? lastTs + 1 : newTs - 300_000, // last 5 min on first run
    max_timestamp: newTs,
  };

  // ── 1. TRC20 USDT transfers ──
  try {
    const url = `${tronGridBase}/accounts/${paymentAddr}/transactions/trc20`;
    const response = await axios.get(url, {
      headers,
      params: { ...queryParams, contract_address: config.usdtTrc20Contract },
      timeout: 10_000,
    });

    const transfers = response.data?.data || [];

    for (const t of transfers) {
      // Only incoming to our address
      if (t.to !== paymentAddr) continue;

      const amount = parseFloat(t.value) / Math.pow(10, config.usdtDecimals.tron);

      await saveTx({
        txHash: t.transaction_id,
        network: 'tron',
        coinType: 'usdt',
        fromAddress: t.from,
        toAddress: t.to,
        amount,
        blockNumber: null,
        raw: { blockTimestamp: t.block_timestamp },
      });
    }
  } catch (err) {
    logger.warn('TronGrid TRC20 scan failed', { error: err.message });
  }

  // ── 2. Native TRX transfers ──
  try {
    const url = `${tronGridBase}/accounts/${paymentAddr}/transactions`;
    const response = await axios.get(url, {
      headers,
      params: { ...queryParams, only_to: true },
      timeout: 10_000,
    });

    const txns = response.data?.data || [];

    for (const t of txns) {
      // Only TRX transfers (type = TransferContract)
      const contract = t.raw_data?.contract?.[0];
      if (!contract || contract.type !== 'TransferContract') continue;

      const value = contract.parameter?.value;
      if (!value) continue;

      const toAddrHex = value.to_address;
      const amountSun = value.amount; // 1 TRX = 1_000_000 SUN
      const amount = parseFloat(amountSun) / 1_000_000;

      // Decode hex address to base58 is complex; use the API's provided field
      // TronGrid also returns a decoded version in some endpoints
      const toAddr = t.raw_data_hex ? paymentAddr : paymentAddr; // trust filter

      await saveTx({
        txHash: t.txID,
        network: 'tron',
        coinType: 'trx',
        fromAddress: value.owner_address || 'unknown',
        toAddress: paymentAddr,
        amount,
        blockNumber: null,
        raw: { blockTimestamp: t.block_timestamp },
      });
    }
  } catch (err) {
    logger.warn('TronGrid TRX scan failed', { error: err.message });
  }

  await setConfig('last_tron_ts', newTs);
}

// ── Main Scanner Loop ────────────────────────────────────────

async function runScanCycle() {
  // Run all three network scans in parallel — failures are isolated
  const results = await Promise.allSettled([
    scanBsc(),
    scanEth(),
    scanTron(),
  ]);

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const networks = ['BSC', 'ETH', 'Tron'];
      logger.error(`${networks[i]} scan cycle threw`, { error: r.reason?.message });
    }
  });

  // Immediately trigger matching after each scan cycle
  try {
    await runMatchingCycle();
  } catch (err) {
    logger.error('Post-scan matching cycle failed', { error: err.message });
  }
}

/**
 * Start the blockchain scanner daemon.
 * Runs an immediate cycle on startup, then every 20 seconds.
 */
async function start() {
  logger.info('Blockchain scanner starting…');

  // Immediate first scan
  try {
    await runScanCycle();
  } catch (err) {
    logger.error('Initial scan cycle failed', { error: err.message });
  }

  // Poll every 20 seconds
  setInterval(async () => {
    try {
      await runScanCycle();
    } catch (err) {
      logger.error('Scan interval error', { error: err.message });
    }
  }, 20_000);

  logger.info('Blockchain scanner active — polling every 20s');
}

module.exports = { start, runScanCycle };
