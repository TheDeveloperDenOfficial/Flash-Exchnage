'use strict';
const { ethers } = require('ethers');
const { pool } = require('../db');
const config = require('../config');
const logger = require('../utils/logger').child({ service: 'token-sender' });

// Minimal ERC20 ABI (only what we need)
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

// Provider and signer singletons — initialised lazily
let _provider = null;
let _wallet = null;
let _tokenContract = null;

/**
 * Lazily initialise ethers provider, signer and token contract.
 * Picks the distribution network (BSC or ETH) from config.
 */
function getEthersSetup() {
  if (_wallet && _tokenContract) return { provider: _provider, wallet: _wallet, tokenContract: _tokenContract };

  const rpcUrl = config.tokenNetwork === 'bsc' ? config.bscRpcUrl : config.ethRpcUrl;
  _provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  _wallet = new ethers.Wallet(config.distributionWalletPrivateKey, _provider);
  _tokenContract = new ethers.Contract(config.tokenContractAddress, ERC20_ABI, _wallet);

  return { provider: _provider, wallet: _wallet, tokenContract: _tokenContract };
}

// ── Balance Checks ───────────────────────────────────────────

/**
 * Check distribution wallet balances and emit urgent warnings if below threshold.
 * Called before every token send and periodically by the scanner.
 */
async function checkBalancesAndWarn() {
  try {
    const { provider, wallet, tokenContract } = getEthersSetup();

    // Native gas balance (BNB or ETH)
    const nativeWei = await provider.getBalance(config.distributionWalletAddress);
    const nativeBalance = parseFloat(ethers.utils.formatEther(nativeWei));

    const nativeThreshold = config.tokenNetwork === 'bsc'
      ? config.lowGasThresholdBnb
      : config.lowGasThresholdEth;
    const nativeSymbol = config.tokenNetwork === 'bsc' ? 'BNB' : 'ETH';

    if (nativeBalance < nativeThreshold) {
      logger.error(
        `⚠️  URGENT: Distribution wallet ${nativeSymbol} balance LOW`,
        { balance: nativeBalance, threshold: nativeThreshold, wallet: config.distributionWalletAddress }
      );
    }

    // FLASH token balance
    const tokenRaw = await tokenContract.balanceOf(config.distributionWalletAddress);
    const tokenBalance = parseFloat(
      ethers.utils.formatUnits(tokenRaw, config.tokenDecimals)
    );

    if (tokenBalance < config.lowTokenThreshold) {
      logger.error(
        `⚠️  URGENT: Distribution wallet ${config.tokenSymbol} token balance LOW`,
        { balance: tokenBalance, threshold: config.lowTokenThreshold, wallet: config.distributionWalletAddress }
      );
    }

    logger.debug('Distribution wallet balances OK', {
      [nativeSymbol]: nativeBalance,
      [config.tokenSymbol]: tokenBalance,
    });

    return { nativeBalance, tokenBalance };
  } catch (err) {
    logger.error('Balance check failed', { error: err.message });
    return null;
  }
}

// ── Core Token Send ──────────────────────────────────────────

/**
 * Send FLASH tokens to a buyer's wallet.
 * Handles gas estimation, sends the transaction, and waits for 1 confirmation.
 *
 * @param {string} toAddress     - Buyer's wallet address
 * @param {string|number} amount - FLASH tokens to send (human-readable, not wei)
 * @returns {Promise<{txHash: string, blockNumber: number}>}
 */
async function sendTokens(toAddress, amount) {
  const { tokenContract } = getEthersSetup();

  const amountWei = ethers.utils.parseUnits(String(amount), config.tokenDecimals);

  // Estimate gas with 20% buffer for safety
  const gasEstimate = await tokenContract.estimateGas.transfer(toAddress, amountWei);
  const gasLimit = gasEstimate.mul(120).div(100); // +20%

  logger.info('Sending tokens', {
    to: toAddress,
    amount,
    symbol: config.tokenSymbol,
    gasLimit: gasLimit.toString(),
  });

  const tx = await tokenContract.transfer(toAddress, amountWei, { gasLimit });

  logger.info('Token transfer TX broadcast', { txHash: tx.hash, to: toAddress, amount });

  // Wait for 1 confirmation (not 0 — we need the tx to be mined before marking complete)
  const receipt = await tx.wait(1);

  logger.info('Token transfer confirmed', {
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    to: toAddress,
    amount,
  });

  return { txHash: receipt.transactionHash, blockNumber: receipt.blockNumber };
}

// ── Retry Wrapper ────────────────────────────────────────────

/**
 * Attempt to send tokens up to maxRetries times.
 * Waits retryDelayMs between attempts. On permanent failure, marks order as 'failed'.
 *
 * Error categories:
 *   - Retryable: network congestion (REPLACEMENT_UNDERPRICED, TIMEOUT, SERVER_ERROR)
 *   - Fatal: invalid address, insufficient token balance → don't retry
 *
 * @param {object} order - Full order row from DB
 */
async function sendTokensWithRetry(order) {
  const maxRetries = config.tokenSendMaxRetries;
  const retryDelay = config.tokenSendRetryDelayMs;

  // Mark order as 'sending' immediately so no duplicate sends
  await pool.query(
    `UPDATE orders SET status = 'sending', updated_at = NOW() WHERE id = $1`,
    [order.id]
  );

  // Pre-flight balance check
  await checkBalancesAndWarn();

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info('Token send attempt', {
        attempt,
        maxRetries,
        orderId: order.id,
        to: order.receiving_wallet,
        amount: order.token_amount,
      });

      const { txHash, blockNumber } = await sendTokens(
        order.receiving_wallet,
        order.token_amount
      );

      // ✅ SUCCESS — update order to completed
      await pool.query(
        `UPDATE orders
         SET status = 'completed',
             tx_hash_out = $1,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [txHash, order.id]
      );

      logger.info('Order completed successfully', {
        orderId: order.id,
        txHashOut: txHash,
        blockNumber,
        tokens: order.token_amount,
        recipient: order.receiving_wallet,
      });

      return { success: true, txHash };

    } catch (err) {
      lastError = err;
      const isFatal = isFatalError(err);

      logger.warn(`Token send attempt ${attempt} failed`, {
        orderId: order.id,
        attempt,
        error: err.message,
        code: err.code,
        fatal: isFatal,
      });

      if (isFatal || attempt === maxRetries) break;

      logger.info(`Waiting ${retryDelay / 1000}s before retry…`, { orderId: order.id });
      await sleep(retryDelay);
    }
  }

  // All attempts exhausted — mark as failed
  logger.error('Token send FAILED after all retries', {
    orderId: order.id,
    error: lastError?.message,
    maxRetries,
  });

  await pool.query(
    `UPDATE orders SET status = 'failed', updated_at = NOW() WHERE id = $1`,
    [order.id]
  );

  return { success: false, error: lastError?.message };
}

/**
 * Determine if an error should NOT be retried.
 * Fatal errors indicate a configuration or permanent problem.
 */
function isFatalError(err) {
  const fatalCodes = [
    'INVALID_ARGUMENT',
    'UNPREDICTABLE_GAS_LIMIT',
    'INSUFFICIENT_FUNDS',
    'CALL_EXCEPTION',
  ];
  const fatalMessages = ['invalid address', 'execution reverted', 'insufficient'];

  if (fatalCodes.includes(err.code)) return true;
  const msg = (err.message || '').toLowerCase();
  return fatalMessages.some((m) => msg.includes(m));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { sendTokensWithRetry, checkBalancesAndWarn };
