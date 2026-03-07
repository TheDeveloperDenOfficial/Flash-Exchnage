'use strict';
const { Markup } = require('telegraf');
const { ethers } = require('ethers');
const axios = require('axios');
const { pool, getSetting } = require('../../db');
const config = require('../../config');
const { smartEdit } = require('../middleware/smartEdit');

const TOTAL_SUPPLY   = 1_000_000_000_000; // 1 Trillion
const ERC20_BALANCE_ABI = ['function balanceOf(address owner) view returns (uint256)'];
const TIMEOUT_MS = 6000;

// ── RPC provider cache ────────────────────────────────────────
let _bscProvider = null;
let _ethProvider = null;

function bscProvider() {
  if (!_bscProvider) _bscProvider = new ethers.providers.JsonRpcProvider(config.bscRpcUrl);
  return _bscProvider;
}
function ethProvider() {
  if (!_ethProvider) _ethProvider = new ethers.providers.JsonRpcProvider(config.ethRpcUrl);
  return _ethProvider;
}

// ── Network health — actual RPC ping ─────────────────────────
async function checkNetworkHealth() {
  const results = { bsc: false, eth: false, tron: false };

  const timeout = (promise) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
  ]);

  await Promise.allSettled([
    timeout(bscProvider().getBlockNumber()).then(() => { results.bsc = true; }),
    timeout(ethProvider().getBlockNumber()).then(() => { results.eth = true; }),
    timeout(
      axios.post('https://api.trongrid.io/wallet/getnowblock',
        {},
        { timeout: TIMEOUT_MS, headers: config.trongridApiKey ? { 'TRON-PRO-API-KEY': config.trongridApiKey } : {} }
      )
    ).then(r => { if (r.data?.block_header) results.tron = true; }),
  ]);

  return results;
}

// ── EVM wallet balances (native + USDT) ──────────────────────
async function getEvmBalances(address, network) {
  try {
    const provider     = network === 'bsc' ? bscProvider() : ethProvider();
    const usdtContract = network === 'bsc' ? config.usdtBep20Contract : config.usdtErc20Contract;
    const usdtDec      = config.usdtDecimals[network];

    const timeout = (p) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), TIMEOUT_MS))]);

    const [nativeWei, usdtRaw] = await Promise.all([
      timeout(provider.getBalance(address)),
      timeout(new ethers.Contract(usdtContract, ERC20_BALANCE_ABI, provider).balanceOf(address)),
    ]);

    return {
      native: parseFloat(ethers.utils.formatEther(nativeWei)),
      usdt:   parseFloat(ethers.utils.formatUnits(usdtRaw, usdtDec)),
    };
  } catch {
    return { native: null, usdt: null };
  }
}

// ── Tron wallet balances ──────────────────────────────────────
async function getTronBalances(address) {
  try {
    const headers = config.trongridApiKey ? { 'TRON-PRO-API-KEY': config.trongridApiKey } : {};

    const [accRes, trc20Res] = await Promise.all([
      axios.get(`https://api.trongrid.io/v1/accounts/${address}`, { headers, timeout: TIMEOUT_MS }),
      axios.get(`https://api.trongrid.io/v1/accounts/${address}/tokens?token_id=${config.usdtTrc20Contract}&limit=1`,
        { headers, timeout: TIMEOUT_MS }),
    ]);

    const trxSun = accRes.data?.data?.[0]?.balance || 0;
    const trx    = trxSun / 1_000_000;

    const trc20List = trc20Res.data?.data || [];
    const usdtEntry = trc20List.find(t => t.tokenId === config.usdtTrc20Contract || t.token_id === config.usdtTrc20Contract);
    const usdt = usdtEntry ? parseFloat(usdtEntry.balance) / Math.pow(10, config.usdtDecimals.tron) : 0;

    return { native: trx, usdt };
  } catch {
    return { native: null, usdt: null };
  }
}

// ── Distribution wallet balances ──────────────────────────────
async function getDistributionBalances() {
  try {
    const addr     = config.distributionWalletAddress;
    const provider = bscProvider();
    const timeout  = (p) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('t')), TIMEOUT_MS))]);

    const usdtDec = config.usdtDecimals.bsc;

    const [nativeWei, usdtRaw, flashRaw] = await Promise.all([
      timeout(provider.getBalance(addr)),
      timeout(new ethers.Contract(config.usdtBep20Contract, ERC20_BALANCE_ABI, provider).balanceOf(addr)),
      timeout(new ethers.Contract(config.tokenContractAddress, ERC20_BALANCE_ABI, provider).balanceOf(addr)),
    ]);

    return {
      bnb:   parseFloat(ethers.utils.formatEther(nativeWei)),
      usdt:  parseFloat(ethers.utils.formatUnits(usdtRaw, usdtDec)),
      flash: parseFloat(ethers.utils.formatUnits(flashRaw, config.tokenDecimals)),
    };
  } catch {
    return { bnb: null, usdt: null, flash: null };
  }
}

// ── Format helpers ────────────────────────────────────────────
function fmt(n, dec = 2) {
  if (n === null || n === undefined) return '…';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtLarge(n) {
  if (n === null || n === undefined) return '…';
  if (n >= 1e9)  return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3)  return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function shortAddr(addr) {
  if (!addr) return '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function lastOrderAgo(date) {
  if (!date) return 'No orders yet';
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function healthDot(ok) { return ok ? '🟢' : '🔴'; }

function lowWarn(val, threshold) {
  return (val !== null && val < threshold) ? ' ⚠️' : '';
}

// ── Main dashboard builder ────────────────────────────────────
async function buildDashboard() {
  const [
    tokenPrice,
    minQty,
    tokenSymbol,
    walletRows,
    statsRow,
    allTimeRow,
    lastOrderRow,
    health,
    distBal,
  ] = await Promise.all([
    getSetting('token_price_usd'),
    getSetting('min_order_qty'),
    getSetting('token_symbol'),

    // Receiving wallets
    pool.query(`
      SELECT pw.address, pw.network, pw.is_active, pm.coin_symbol, pm.name, pm.code
      FROM payment_wallets pw
      JOIN payment_methods pm ON pw.payment_method_code = pm.code
      ORDER BY pm.network, pm.coin_symbol
    `),

    // Today's stats
    pool.query(`
      SELECT
        COALESCE(COUNT(*), 0)                                               AS total,
        COALESCE(SUM(CASE WHEN status='completed'        THEN 1 ELSE 0 END),0) AS completed,
        COALESCE(SUM(CASE WHEN status='waiting_payment'  THEN 1 ELSE 0 END),0) AS pending,
        COALESCE(SUM(CASE WHEN status='failed'           THEN 1 ELSE 0 END),0) AS failed,
        COALESCE(SUM(CASE WHEN status='completed' THEN usdt_amount ELSE 0 END),0) AS revenue
      FROM orders WHERE created_at >= CURRENT_DATE
    `),

    // All time
    pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN status='completed' THEN token_amount ELSE 0 END),0) AS tokens_sold,
        COALESCE(SUM(CASE WHEN status='completed' THEN usdt_amount  ELSE 0 END),0) AS revenue
      FROM orders
    `),

    // Last order
    pool.query(`SELECT created_at FROM orders ORDER BY created_at DESC LIMIT 1`),

    // Network health
    checkNetworkHealth(),

    // Distribution wallet
    getDistributionBalances(),
  ]);

  const today    = statsRow.rows[0];
  const allTime  = allTimeRow.rows[0];
  const lastOrder = lastOrderRow.rows[0]?.created_at;

  // Unmatched count
  const { rows: unmatchedRows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM wallet_transactions WHERE status='unmatched'`
  );
  const unmatched = parseInt(unmatchedRows[0].cnt, 10);

  // Fetch receiving wallet balances concurrently
  const wallets = walletRows.rows;
  const walletBalances = await Promise.all(
    wallets.map(w => {
      if (!w.is_active) return Promise.resolve({ native: null, usdt: null });
      if (w.network === 'tron') return getTronBalances(w.address);
      return getEvmBalances(w.address, w.network);
    })
  );

  // ── Sale progress ─────────────────────────────────────────
  const tokensSold   = parseFloat(allTime.tokens_sold) || 0;
  const progressPct  = Math.min(100, (tokensSold / TOTAL_SUPPLY) * 100);
  const barFilled    = Math.round(progressPct / 5); // 20 chars total
  const progressBar  = '█'.repeat(barFilled) + '░'.repeat(20 - barFilled);

  // ── Build message ─────────────────────────────────────────
  const lines = [];

  lines.push(`⚡ <b>Flash Exchange Management</b>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Sale info
  lines.push(``);
  lines.push(`💲 <b>${tokenSymbol || 'FLASH'}</b> Price: <b>$${tokenPrice}</b>  ·  Min order: <b>${minQty}</b>`);

  // Receiving wallets
  lines.push(``);
  lines.push(`📥 <b>Receiving Wallets</b>`);

  if (!wallets.length) {
    lines.push(`  <i>No wallets configured</i>`);
  } else {
    wallets.forEach((w, i) => {
      const bal    = walletBalances[i];
      const status = w.is_active ? '' : ' 🔴';
      const nativeSym = w.coin_symbol === 'USDT'
        ? (w.network === 'bsc' ? 'BNB' : w.network === 'eth' ? 'ETH' : 'TRX')
        : w.coin_symbol;

      if (!w.is_active) {
        lines.push(`  <b>${nativeSym}</b>  <code>${shortAddr(w.address)}</code>${status}`);
      } else if (bal.usdt === null) {
        lines.push(`  <b>${nativeSym}</b>  <code>${shortAddr(w.address)}</code>  <i>loading…</i>`);
      } else {
        const usdtPart   = `USDT: ${fmt(bal.usdt)}`;
        const nativePart = `${nativeSym}: ${fmt(bal.native, 4)}`;
        lines.push(`  <b>${nativeSym}</b>  <code>${shortAddr(w.address)}</code>`);
        lines.push(`         ${usdtPart}  |  ${nativePart}`);
      }
    });
  }

  // Distribution wallet
  lines.push(``);
  lines.push(`💸 <b>Distribution Wallet</b>`);
  lines.push(`  <code>${shortAddr(config.distributionWalletAddress)}</code>`);
  const flashWarn = lowWarn(distBal.flash, config.lowTokenThreshold);
  const bnbWarn   = lowWarn(distBal.bnb,   config.lowGasThresholdBnb);
  lines.push(`  FLASH: <b>${fmtLarge(distBal.flash)}</b>${flashWarn}  |  USDT: ${fmt(distBal.usdt)}  |  BNB: ${fmt(distBal.bnb, 4)}${bnbWarn}`);

  // Today's stats
  lines.push(``);
  lines.push(`📊 <b>Today</b>  ·  Last order: <i>${lastOrderAgo(lastOrder)}</i>`);
  lines.push(`  Orders: <b>${today.total}</b>  ·  Revenue: <b>$${fmt(today.revenue)}</b>`);

  const todayAlerts = [];
  if (parseInt(today.pending, 10) > 0)  todayAlerts.push(`⏳ ${today.pending} pending`);
  if (parseInt(today.failed,  10) > 0)  todayAlerts.push(`❌ ${today.failed} failed`);
  if (unmatched > 0)                    todayAlerts.push(`🔴 ${unmatched} unmatched`);
  if (todayAlerts.length) lines.push(`  ${todayAlerts.join('  ')}`);

  // All-time progress
  lines.push(``);
  lines.push(`📈 <b>All Time</b>  ·  Revenue: $${fmt(parseFloat(allTime.revenue))}`);
  lines.push(`  <code>${progressBar}</code> ${progressPct.toFixed(2)}%`);
  lines.push(`  ${fmtLarge(tokensSold)} / 1T FLASH sold`);

  // Network health
  lines.push(``);
  lines.push(`🌐 <b>Network Health</b>`);
  lines.push(`  BSC ${healthDot(health.bsc)}  ETH ${healthDot(health.eth)}  TRON ${healthDot(health.tron)}`);

  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`🕐 <i>${new Date().toUTCString()}</i>`);

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('📋  Orders',       'nav_orders'),
      Markup.button.callback('💰  Wallets',      'nav_wallets'),
      Markup.button.callback('⚙️  Settings',     'nav_settings'),
    ],
    [
      Markup.button.callback('👥  Admins',       'nav_admins'),
      Markup.button.callback('🔍  Unmatched',    'nav_unmatched'),
      Markup.button.callback('🔄  Refresh',      'nav_home'),
    ],
  ]);

  return { msg: lines.join('\n'), keyboard };
}

// ── Public handler ────────────────────────────────────────────
async function handleHome(ctx) {
  try {
    const { msg, keyboard } = await buildDashboard();
    await smartEdit(ctx, msg, { parse_mode: 'HTML', ...keyboard });
  } catch (err) {
    await smartEdit(ctx, `❌ Dashboard error: ${err.message}`, {
      ...Markup.inlineKeyboard([[Markup.button.callback('🔄  Retry', 'nav_home')]]),
    });
  }
}

module.exports = { handleHome };
