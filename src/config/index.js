'use strict';
require('dotenv').config();

// Validate required environment variables at startup
const REQUIRED = [
  'DISTRIBUTION_WALLET_PRIVATE_KEY',
  'DISTRIBUTION_WALLET_ADDRESS',
  'TOKEN_CONTRACT_ADDRESS',
  'BSC_PAYMENT_ADDRESS',
  'ETH_PAYMENT_ADDRESS',
  'TRON_PAYMENT_ADDRESS',
];

function assertRequired() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[CONFIG] FATAL: Missing required environment variables:\n  ${missing.join('\n  ')}`);
    console.error('[CONFIG] Please copy .env.example to .env and fill in all required values.');
    process.exit(1);
  }
}

// Only enforce in production — allow dev without all keys
if (process.env.NODE_ENV === 'production') {
  assertRequired();
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  // Database
  databaseUrl: process.env.DATABASE_URL,
  db: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT, 10) || 5432,
    database: process.env.PGDATABASE || 'flashexchange',
    user: process.env.PGUSER || 'flashuser',
    password: process.env.PGPASSWORD || 'password',
    ssl: process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL?.includes('localhost')
      ? { rejectUnauthorized: false }
      : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },

  // Admin
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'changeme',

  // Token
  tokenNetwork: process.env.TOKEN_NETWORK || 'bsc',
  tokenContractAddress: process.env.TOKEN_CONTRACT_ADDRESS,
  tokenDecimals: parseInt(process.env.TOKEN_DECIMALS, 10) || 18,
  tokenSymbol: process.env.TOKEN_SYMBOL || 'FLASH',
  tokenPriceUsd: parseFloat(process.env.TOKEN_PRICE_USD) || 0.02,

  // Distribution Wallet
  distributionWalletAddress: process.env.DISTRIBUTION_WALLET_ADDRESS,
  distributionWalletPrivateKey: process.env.DISTRIBUTION_WALLET_PRIVATE_KEY,

  // Payment Addresses (where buyers send their crypto)
  bscPaymentAddress: process.env.BSC_PAYMENT_ADDRESS,
  ethPaymentAddress: process.env.ETH_PAYMENT_ADDRESS,
  tronPaymentAddress: process.env.TRON_PAYMENT_ADDRESS,

  // RPC Endpoints
  bscRpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/',
  bscRpcUrlFallback: process.env.BSC_RPC_URL_FALLBACK || 'https://bsc-dataseed1.defibit.io/',
  ethRpcUrl: process.env.ETH_RPC_URL || 'https://cloudflare-eth.com',
  ethRpcUrlFallback: process.env.ETH_RPC_URL_FALLBACK || 'https://rpc.ankr.com/eth',
  trongridApiKey: process.env.TRONGRID_API_KEY || '',

  // Contract Addresses
  usdtBep20Contract: process.env.USDT_BEP20_CONTRACT || '0x55d398326f99059ff775485246999027b3197955',
  usdtErc20Contract: process.env.USDT_ERC20_CONTRACT || '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  usdtTrc20Contract: process.env.USDT_TRC20_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',

  // ERC20/BEP20 USDT decimals differ by network
  usdtDecimals: {
    bsc: 18,  // BEP20 USDT uses 18 decimals
    eth: 6,   // ERC20 USDT uses 6 decimals
    tron: 6,  // TRC20 USDT uses 6 decimals
  },

  // Thresholds
  lowGasThresholdBnb: parseFloat(process.env.LOW_GAS_THRESHOLD_BNB) || 0.05,
  lowGasThresholdEth: parseFloat(process.env.LOW_GAS_THRESHOLD_ETH) || 0.01,
  lowTokenThreshold: parseFloat(process.env.LOW_TOKEN_THRESHOLD) || 10000,

  // Order Config
  orderExpiryMinutes: parseInt(process.env.ORDER_EXPIRY_MINUTES, 10) || 30,
  tokenSendMaxRetries: parseInt(process.env.TOKEN_SEND_MAX_RETRIES, 10) || 3,
  tokenSendRetryDelayMs: parseInt(process.env.TOKEN_SEND_RETRY_DELAY_MS, 10) || 60000,

  // CoinGecko
  coingeckoApiKey: process.env.COINGECKO_API_KEY || '',

  // Helpers
  getPaymentAddress(network) {
    const map = { bsc: this.bscPaymentAddress, eth: this.ethPaymentAddress, tron: this.tronPaymentAddress };
    return map[network] || null;
  },
};

module.exports = config;
