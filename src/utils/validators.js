'use strict';
const { ethers } = require('ethers');
const config = require('../config');

let _provider = null;

function getProvider() {
  if (!_provider) {
    _provider = new ethers.providers.FallbackProvider([
      { provider: new ethers.providers.JsonRpcProvider(config.bscRpcUrl),         priority: 1, stallTimeout: 5000 },
      { provider: new ethers.providers.JsonRpcProvider(config.bscRpcUrlFallback), priority: 2, stallTimeout: 7000 },
    ]);
  }
  return _provider;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Validate a BEP20/EVM receiving wallet address.
 *
 * Checks:
 *   1. Format — starts with 0x, 42 chars, valid hex
 *   2. EIP-55 checksum via ethers
 *   3. Not zero address
 *   4. Not a smart contract (eth_getCode via BSC RPC)
 *
 * Returns { valid: true } or { valid: false, reason: string }
 */
async function validateBep20Wallet(address) {
  if (!address || typeof address !== 'string') {
    return { valid: false, reason: 'Wallet address is required.' };
  }

  const trimmed = address.trim();

  // 1. Basic format
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return { valid: false, reason: 'Invalid wallet address format. Must be a 42-character hex string starting with 0x.' };
  }

  // 2. Zero address
  if (trimmed.toLowerCase() === ZERO_ADDRESS) {
    return { valid: false, reason: 'Zero address is not a valid receiving wallet.' };
  }

  // 3. EIP-55 checksum (ethers normalises it — if it throws, it's malformed)
  try {
    ethers.utils.getAddress(trimmed);
  } catch {
    return { valid: false, reason: 'Invalid wallet address checksum.' };
  }

  // 4. Contract check via BSC RPC
  try {
    const code = await getProvider().getCode(trimmed);
    if (code && code !== '0x') {
      return { valid: false, reason: 'This address belongs to a smart contract. Tokens sent to contracts may be lost. Please use a personal wallet address.' };
    }
  } catch {
    // RPC unavailable — don't block the order, just skip contract check
  }

  return { valid: true };
}

/**
 * Validate a Tron address (Base58Check format).
 * Used only for validating the FROM address in Tron transactions — not receiving wallet.
 */
function isValidTronAddress(address) {
  return typeof address === 'string' && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
}

module.exports = { validateBep20Wallet, isValidTronAddress };
