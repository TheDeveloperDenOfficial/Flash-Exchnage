'use strict';
const { ethers } = require('ethers');
const { pool } = require('../db');
const config = require('../config');
const logger = require('../utils/logger').child({ service: 'token-sender' });

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
];

let _provider = null;
let _wallet   = null;
let _token    = null;

function setup() {
  if (_wallet) return { provider: _provider, wallet: _wallet, token: _token };
  const rpc = config.tokenNetwork === 'bsc' ? config.bscRpcUrl : config.ethRpcUrl;
  _provider = new ethers.providers.JsonRpcProvider(rpc);
  _wallet   = new ethers.Wallet(config.distributionWalletPrivateKey, _provider);
  _token    = new ethers.Contract(config.tokenContractAddress, ERC20_ABI, _wallet);
  return { provider: _provider, wallet: _wallet, token: _token };
}

// ── Balance check ─────────────────────────────────────────────
async function checkBalances() {
  try {
    const { provider, token } = setup();
    const nativeWei   = await provider.getBalance(config.distributionWalletAddress);
    const native      = parseFloat(ethers.utils.formatEther(nativeWei));
    const tokenRaw    = await token.balanceOf(config.distributionWalletAddress);
    const tokenBal    = parseFloat(ethers.utils.formatUnits(tokenRaw, config.tokenDecimals));
    const nativeSym   = config.tokenNetwork === 'bsc' ? 'BNB' : 'ETH';
    const threshold   = config.tokenNetwork === 'bsc' ? config.lowGasThresholdBnb : config.lowGasThresholdEth;

    if (native < threshold) {
      logger.error(`⚠️  URGENT: Low ${nativeSym} balance on distribution wallet`, { balance: native, threshold });
      try {
        const notify = require('../bot/notify');
        notify.lowBalance(nativeSym, native.toFixed(6), threshold);
      } catch {}
    }
    if (tokenBal < config.lowTokenThreshold) {
      logger.error(`⚠️  URGENT: Low ${config.tokenSymbol} balance on distribution wallet`, { balance: tokenBal, threshold: config.lowTokenThreshold });
      try {
        const notify = require('../bot/notify');
        notify.lowBalance(config.tokenSymbol, tokenBal.toFixed(2), config.lowTokenThreshold);
      } catch {}
    }
    return { native, tokenBal, nativeSym };
  } catch (err) {
    logger.error('Balance check failed', { error: err.message });
    return null;
  }
}

// ── Single send attempt ───────────────────────────────────────
async function sendOnce(toAddress, amount) {
  const { token } = setup();
  const amtWei    = ethers.utils.parseUnits(String(amount), config.tokenDecimals);
  const gasEst    = await token.estimateGas.transfer(toAddress, amtWei);
  const gasLimit  = gasEst.mul(120).div(100); // +20% buffer
  const tx        = await token.transfer(toAddress, amtWei, { gasLimit });
  logger.info('TX broadcast', { txHash: tx.hash, to: toAddress, amount });
  const receipt   = await tx.wait(1);
  return { txHash: receipt.transactionHash, blockNumber: receipt.blockNumber };
}

// ── Auto-retry wrapper ────────────────────────────────────────
async function sendTokensWithRetry(order) {
  const MAX_RETRIES = 3;
  const DELAY_MS    = 60_000; // 1 minute between retries

  // Mark sending immediately to prevent duplicate sends
  await pool.query(`UPDATE orders SET status='sending', updated_at=NOW() WHERE id=$1`, [order.id]);

  await checkBalances();

  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info('Send attempt', { attempt, orderId: order.id, to: order.receiving_wallet, amount: order.token_amount });
      const { txHash } = await sendOnce(order.receiving_wallet, order.token_amount);

      await pool.query(
        `UPDATE orders SET status='completed', tx_hash_out=$1, completed_at=NOW(), updated_at=NOW() WHERE id=$2`,
        [txHash, order.id]
      );
      logger.info('Order completed', { orderId: order.id, txHash });
      return { success: true, txHash };

    } catch (err) {
      lastErr = err;
      logger.warn(`Send attempt ${attempt} failed`, { orderId: order.id, error: err.message, code: err.code });

      // Fatal errors — don't retry
      const fatal = ['INVALID_ARGUMENT', 'CALL_EXCEPTION', 'INSUFFICIENT_FUNDS'].includes(err.code)
        || (err.message || '').toLowerCase().includes('invalid address');
      if (fatal || attempt === MAX_RETRIES) break;

      // Increment retry count in DB
      await pool.query(`UPDATE orders SET retry_count=retry_count+1, updated_at=NOW() WHERE id=$1`, [order.id]);
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  await pool.query(`UPDATE orders SET status='failed', retry_count=retry_count+1, updated_at=NOW() WHERE id=$1`, [order.id]);
  logger.error('All send retries exhausted', { orderId: order.id, error: lastErr?.message });
  return { success: false, error: lastErr?.message };
}

module.exports = { sendTokensWithRetry, checkBalances };
