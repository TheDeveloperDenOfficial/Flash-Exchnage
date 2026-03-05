'use strict';
require('dotenv').config();

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
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },

  // Telegram
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  bootstrapAdminId: parseInt(process.env.BOOTSTRAP_ADMIN_TELEGRAM_ID, 10),

  // Distribution wallet
  distributionWalletAddress: process.env.DISTRIBUTION_WALLET_ADDRESS,
  distributionWalletPrivateKey: process.env.DISTRIBUTION_WALLET_PRIVATE_KEY,

  // Token
  tokenContractAddress: process.env.TOKEN_CONTRACT_ADDRESS,
  tokenDecimals: parseInt(process.env.TOKEN_DECIMALS, 10) || 18,
  tokenSymbol: process.env.TOKEN_SYMBOL || 'FLASH',
  tokenNetwork: process.env.TOKEN_NETWORK || 'bsc',

  // RPC
  bscRpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/',
  bscRpcUrlFallback: process.env.BSC_RPC_URL_FALLBACK || 'https://bsc-dataseed1.defibit.io/',
  ethRpcUrl: process.env.ETH_RPC_URL || 'https://cloudflare-eth.com',
  ethRpcUrlFallback: process.env.ETH_RPC_URL_FALLBACK || 'https://rpc.ankr.com/eth',
  trongridApiKey: process.env.TRONGRID_API_KEY || '',

  // USDT contracts (from env, never in DB)
  usdtBep20Contract: process.env.USDT_BEP20_CONTRACT || '0x55d398326f99059ff775485246999027b3197955',
  usdtErc20Contract: process.env.USDT_ERC20_CONTRACT || '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  usdtTrc20Contract: process.env.USDT_TRC20_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',

  // USDT decimals per network
  usdtDecimals: {
    bsc:  parseInt(process.env.USDT_BEP20_DECIMALS, 10) || 18,
    eth:  parseInt(process.env.USDT_ERC20_DECIMALS, 10) || 6,
    tron: parseInt(process.env.USDT_TRC20_DECIMALS, 10) || 6,
  },

  // Thresholds
  lowGasThresholdBnb: parseFloat(process.env.LOW_GAS_THRESHOLD_BNB) || 0.05,
  lowGasThresholdEth: parseFloat(process.env.LOW_GAS_THRESHOLD_ETH) || 0.01,
  lowTokenThreshold:  parseFloat(process.env.LOW_TOKEN_THRESHOLD)   || 10000,

  // CoinGecko
  coingeckoApiKey: process.env.COINGECKO_API_KEY || '',
};

module.exports = config;
