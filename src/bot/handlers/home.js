'use strict';
const { Markup } = require('telegraf');
const { ethers } = require('ethers');
const axios = require('axios');
const { pool, getSetting } = require('../../db');
const config = require('../../config');
const { smartEdit } = require('../middleware/smartEdit');

const TOTAL_SUPPLY  = 1_000_000_000_000; // 1T
const TIMEOUT_MS    = 6000;
const ERC20_ABI     = ['function balanceOf(address owner) view returns (uint256)'];

// ── Provider cache ────────────────────────────────────────────
let _bsc = null, _eth = null;
const bscProv = () => { if (!_bsc) _bsc = new ethers.providers.JsonRpcProvider(config.bscRpcUrl); return _bsc; };
const ethProv = () => { if (!_eth) _eth = new ethers.providers.JsonRpcProvider(config.ethRpcUrl); return _eth; };

const withTimeout = (p) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), TIMEOUT_MS))]);

// ── Network health ────────────────────────────────────────────
async function checkHealth() {
  const h = { bsc: false, eth: false, tron: false };
  await Promise.allSettled([
    withTimeout(bscProv().getBlockNumber()).then(() => { h.bsc = true; }),
    withTimeout(ethProv().getBlockNumber()).then(() => { h.eth = true; }),
    withTimeout(axios.post('https://api.trongrid.io/wallet/getnowblock', {}, {
      timeout: TIMEOUT_MS,
      headers: config.trongridApiKey ? { 'TRON-PRO-API-KEY': config.trongridApiKey } : {},
    })).then(r => { if (r.data?.block_header) h.tron = true; }),
  ]);
  return h;
}

// ── EVM wallet balances ───────────────────────────────────────
async function getEvmBal(address, network) {
  try {
    const prov      = network === 'bsc' ? bscProv() : ethProv();
    const usdtAddr  = network === 'bsc' ? config.usdtBep20Contract : config.usdtErc20Contract;
    const usdtDec   = config.usdtDecimals[network];
    const nativeSym = network === 'bsc' ? 'BNB' : 'ETH';

    const [nativeWei, usdtRaw] = await withTimeout(Promise.all([
      prov.getBalance(address),
      new ethers.Contract(usdtAddr, ERC20_ABI, prov).balanceOf(address),
    ]));

    return {
      usdt:   parseFloat(ethers.utils.formatUnits(usdtRaw, usdtDec)),
      native: parseFloat(ethers.utils.formatEther(nativeWei)),
      nativeSym,
    };
  } catch {
    return { usdt: null, native: null, nativeSym: network === 'bsc' ? 'BNB' : 'ETH' };
  }
}

// ── Tron wallet balances ──────────────────────────────────────
async function getTronBal(address) {
  try {
    const headers = config.trongridApiKey ? { 'TRON-PRO-API-KEY': config.trongridApiKey } : {};
    const [accRes, trc20Res] = await withTimeout(Promise.all([
      axios.get(`https://api.trongrid.io/v1/accounts/${address}`, { headers, timeout: TIMEOUT_MS }),
      axios.get(`https://api.trongrid.io/v1/accounts/${address}/tokens?limit=10`, { headers, timeout: TIMEOUT_MS }),
    ]));
    const trx       = (accRes.data?.data?.[0]?.balance || 0) / 1_000_000;
    const trc20List = trc20Res.data?.data || [];
    const usdtEntry = trc20List.find(t =>
      (t.tokenId || t.token_id || '').toLowerCase() === config.usdtTrc20Contract.toLowerCase()
    );
    const usdt = usdtEntry
      ? parseFloat(usdtEntry.balance) / Math.pow(10, config.usdtDecimals.tron)
      : 0;
    return { usdt, native: trx, nativeSym: 'TRX' };
  } catch {
    return { usdt: null, native: null, nativeSym: 'TRX' };
  }
}

// ── Distribution wallet ───────────────────────────────────────
async function getDistBal() {
  try {
    const addr = config.distributionWalletAddress;
    const prov = bscProv();
    const [nativeWei, usdtRaw, flashRaw] = await withTimeout(Promise.all([
      prov.getBalance(addr),
      new ethers.Contract(config.usdtBep20Contract, ERC20_ABI, prov).balanceOf(addr),
      new ethers.Contract(config.tokenContractAddress, ERC20_ABI, prov).balanceOf(addr),
    ]));
    return {
      bnb:   parseFloat(ethers.utils.formatEther(nativeWei)),
      usdt:  parseFloat(ethers.utils.formatUnits(usdtRaw, config.usdtDecimals.bsc)),
      flash: parseFloat(ethers.utils.formatUnits(flashRaw, config.tokenDecimals)),
    };
  } catch {
    return { bnb: null, usdt: null, flash: null };
  }
}

// ── Formatters ────────────────────────────────────────────────
const n2 = (v) => v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n4 = (v) => v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

function fmtFlash(v) {
  if (v === null || v === undefined) return '—';
  if (v >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9)  return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6)  return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3)  return (v / 1e3).toFixed(1) + 'K';
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function shortAddr(addr) {
  if (!addr) return '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function timeAgo(date) {
  if (!date) return 'no orders yet';
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtTimestamp(d) {
  return d.toUTCString().replace(/:\d\d GMT$/, ' UTC');
}

// ── Build dashboard ───────────────────────────────────────────
async function buildDashboard() {
  const [
    tokenPrice, minQty, tokenSymbol,
    walletRows, statsRow, allTimeRow, lastOrderRow,
    health, distBal,
  ] = await Promise.all([
    getSetting('token_price_usd'),
    getSetting('min_order_qty'),
    getSetting('token_symbol'),

    pool.query(`
      SELECT pw.address, pw.network, pw.is_active, pm.coin_symbol, pm.code
      FROM payment_wallets pw
      JOIN payment_methods pm ON pw.payment_method_code = pm.code
      ORDER BY pw.network, pw.address
    `),
    pool.query(`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN status='waiting_payment' THEN 1 ELSE 0 END)::int AS pending,
        SUM(CASE WHEN status='failed'          THEN 1 ELSE 0 END)::int AS failed,
        COALESCE(SUM(CASE WHEN status='completed' THEN usdt_amount ELSE 0 END),0) AS revenue
      FROM orders WHERE created_at >= CURRENT_DATE
    `),
    pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN status='completed' THEN token_amount ELSE 0 END),0) AS tokens_sold,
        COALESCE(SUM(CASE WHEN status='completed' THEN usdt_amount  ELSE 0 END),0) AS revenue
      FROM orders
    `),
    pool.query(`SELECT created_at FROM orders ORDER BY created_at DESC LIMIT 1`),
    checkHealth(),
    getDistBal(),
  ]);

  const { rows: unmatchedRows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM wallet_transactions WHERE status='unmatched'`
  );

  const today     = statsRow.rows[0];
  const allTime   = allTimeRow.rows[0];
  const lastOrder = lastOrderRow.rows[0]?.created_at;
  const unmatched = parseInt(unmatchedRows[0].cnt, 10);
  const sym       = tokenSymbol || 'FLASH';

  // Group wallets by network — deduplicate addresses per network
  const wallets    = walletRows.rows;
  const networkMap = {};
  for (const w of wallets) {
    if (!networkMap[w.network]) networkMap[w.network] = {};
    if (!networkMap[w.network][w.address]) {
      networkMap[w.network][w.address] = { ...w, coins: [] };
    }
    networkMap[w.network][w.address].coins.push(w.coin_symbol);
  }

  // Fetch balances per unique address
  const uniqueEntries = Object.values(networkMap).flatMap(addrs => Object.values(addrs));
  const balances = await Promise.all(
    uniqueEntries.map(e => {
      if (!e.is_active) return Promise.resolve({ usdt: null, native: null, nativeSym: e.network === 'tron' ? 'TRX' : e.network === 'eth' ? 'ETH' : 'BNB' });
      if (e.network === 'tron') return getTronBal(e.address);
      return getEvmBal(e.address, e.network);
    })
  );

  // ── Sale progress ─────────────────────────────────────────
  const tokensSold = parseFloat(allTime.tokens_sold) || 0;
  const pct        = Math.min(100, (tokensSold / TOTAL_SUPPLY) * 100);
  const filled     = Math.round(pct / 5);
  const bar        = '▓'.repeat(filled) + '░'.repeat(20 - filled);

  // ── Helpers ───────────────────────────────────────────────
  const netDot   = (ok) => ok ? '🟢' : '🔴';
  const netEmoji = { bsc: '🔶', eth: '💎', tron: '🔴' };
  const netLabel = { bsc: 'BSC', eth: 'ETH', tron: 'TRON' };

  // ── Compose message ───────────────────────────────────────
  const L = [];

  // Header
  L.push(`⚡ <b>FLASH EXCHANGE</b>`);
  L.push(`<code>━━━━━━━━━━━━━━━━━━━━━━━━━</code>`);

  // Network status
  L.push(``);
  L.push(`🌐 <b>Network Status</b>`);
  L.push(`   ${netDot(health.bsc)} <b>BSC</b>  ${netDot(health.eth)} <b>ETH</b>  ${netDot(health.tron)} <b>TRON</b>`);

  // Token price
  L.push(``);
  L.push(`💰 <b>Token Price</b>`);
  L.push(`   <b>$${tokenPrice}</b> per ${sym}  ·  Min order: <b>${Number(minQty).toLocaleString()}</b> tokens`);

  // Receiving wallets
  L.push(``);
  L.push(`📥 <b>Receiving Wallets</b>`);

  if (!uniqueEntries.length) {
    L.push(`   <i>⚠️ No wallets configured</i>`);
  } else {
    let bIdx = 0;
    for (const net of ['bsc', 'eth', 'tron']) {
      if (!networkMap[net]) continue;
      L.push(`   ${netEmoji[net]} <b>${netLabel[net]}</b>`);
      for (const addr of Object.keys(networkMap[net])) {
        const bal   = balances[bIdx++];
        const entry = networkMap[net][addr];
        if (!entry.is_active) {
          L.push(`      <code>${shortAddr(addr)}</code>  <i>disabled</i>`);
          continue;
        }
        const usdtStr   = bal.usdt   !== null ? `💵 $${n2(bal.usdt)}`                 : `💵 —`;
        const nativeStr = bal.native !== null ? `${bal.nativeSym}: ${n4(bal.native)}` : `${bal.nativeSym}: —`;
        L.push(`      <code>${shortAddr(addr)}</code>`);
        L.push(`      ${usdtStr}  ·  ${nativeStr}`);
      }
    }
  }

  // Distribution wallet
  const flashWarn = distBal.flash !== null && distBal.flash < config.lowTokenThreshold;
  const bnbWarn   = distBal.bnb   !== null && distBal.bnb   < (config.lowGasThresholdBnb || 0.01);

  L.push(``);
  L.push(`🏦 <b>Distribution Wallet</b>  <i>(BSC)</i>`);
  L.push(`   <code>${shortAddr(config.distributionWalletAddress)}</code>`);
  L.push(
    `   ⚡ <b>${fmtFlash(distBal.flash)}</b>${flashWarn ? '  <b>⚠️ LOW</b>' : ''}` +
    `  ·  💵 $${n2(distBal.usdt)}` +
    `  ·  🟡 BNB ${n4(distBal.bnb)}${bnbWarn ? '  <b>⚠️ LOW</b>' : ''}`
  );

  // Today's stats
  const todayTotal   = parseInt(today.total,   10) || 0;
  const todayPending = parseInt(today.pending, 10) || 0;
  const todayFailed  = parseInt(today.failed,  10) || 0;

  L.push(``);
  L.push(`📊 <b>Today</b>  <i>· ${timeAgo(lastOrder)}</i>`);
  L.push(`   📦 <b>${todayTotal}</b> order${todayTotal !== 1 ? 's' : ''}  ·  💵 <b>$${n2(today.revenue)}</b> revenue`);

  const alerts = [];
  if (todayPending > 0) alerts.push(`⏳ ${todayPending} pending`);
  if (todayFailed  > 0) alerts.push(`❌ ${todayFailed} failed`);
  if (unmatched    > 0) alerts.push(`🔍 ${unmatched} unmatched`);
  L.push(`   ${alerts.length ? alerts.join('  ·  ') : '✅ All clear'}`);

  // All-time stats
  L.push(``);
  L.push(`📈 <b>All Time</b>  ·  💵 <b>$${n2(parseFloat(allTime.revenue))}</b> total revenue`);
  L.push(`   <code>${bar}</code> ${pct.toFixed(2)}%`);
  L.push(`   ⚡ ${fmtFlash(tokensSold)} <b>/</b> 1T ${sym} sold`);

  // Footer
  L.push(``);
  L.push(`<code>━━━━━━━━━━━━━━━━━━━━━━━━━</code>`);
  L.push(`🕐 <i>${fmtTimestamp(new Date())}</i>`);

  // Keyboard
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('📦 Orders',    'nav_orders'),
      Markup.button.callback('👛 Wallets',   'nav_wallets'),
      Markup.button.callback('⚙️ Settings',  'nav_settings'),
    ],
    [
      Markup.button.callback('👤 Admins',    'nav_admins'),
      Markup.button.callback('🔍 Unmatched', 'nav_unmatched'),
      Markup.button.callback('🔄 Refresh',   'nav_home'),
    ],
  ]);

  return { msg: L.join('\n'), keyboard };
}

// ── Public handler ────────────────────────────────────────────
async function handleHome(ctx) {
  try {
    const { msg, keyboard } = await buildDashboard();
    await smartEdit(ctx, msg, { parse_mode: 'HTML', ...keyboard });
  } catch (err) {
    await smartEdit(ctx, [
      `⚠️ <b>Dashboard Error</b>`,
      ``,
      `<code>${err.message}</code>`,
    ].join('\n'), {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔄 Retry', 'nav_home')]]),
    });
  }
}

module.exports = { handleHome };
