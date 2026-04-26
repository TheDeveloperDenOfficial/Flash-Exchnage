'use strict';
const { ethers } = require('ethers');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Validate a BEP20/EVM receiving wallet address.
 *
 * Checks:
 *   1. Format — starts with 0x, 42 chars, valid hex
 *   2. Not zero address
 *   3. EIP-55 checksum via ethers (normalises mixed-case inputs)
 *
 * NOTE: We intentionally do NOT call eth_getCode to check for contract bytecode.
 * Smart contract wallets (Gnosis Safe, AA wallets, exchange custody contracts, etc.)
 * are deployed contracts but are completely valid receiving addresses — blocking them
 * causes false positives for real users without adding meaningful security.
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

  // 3. EIP-55 checksum — ethers normalises it; throws if address is malformed
  try {
    ethers.utils.getAddress(trimmed);
  } catch {
    return { valid: false, reason: 'Invalid wallet address checksum.' };
  }

  return { valid: true };
}

/**
 * Validate an ERC-20 (Ethereum) receiving wallet address.
 * Same format rules as BEP-20 — both are EVM 0x addresses.
 */
async function validateErc20Wallet(address) {
  if (!address || typeof address !== 'string') {
    return { valid: false, reason: 'Wallet address is required.' };
  }
  const trimmed = address.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return { valid: false, reason: 'Invalid Ethereum wallet address. Must be a 42-character hex string starting with 0x.' };
  }
  if (trimmed.toLowerCase() === ZERO_ADDRESS) {
    return { valid: false, reason: 'Zero address is not a valid receiving wallet.' };
  }
  try {
    ethers.utils.getAddress(trimmed);
  } catch {
    return { valid: false, reason: 'Invalid Ethereum wallet address checksum.' };
  }
  return { valid: true };
}

/**
 * Validate a TRC-20 (TRON) receiving wallet address.
 * Base58Check format — starts with T, 34 characters.
 */
function validateTrc20Wallet(address) {
  if (!address || typeof address !== 'string') {
    return { valid: false, reason: 'Wallet address is required.' };
  }
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address.trim())) {
    return { valid: false, reason: 'Invalid TRON wallet address. Must start with T and be 34 characters.' };
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

module.exports = { validateBep20Wallet, validateErc20Wallet, validateTrc20Wallet, isValidTronAddress };
