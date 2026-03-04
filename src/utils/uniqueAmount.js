'use strict';
const crypto = require('crypto');

/**
 * Generates a unique crypto amount by appending a 5-digit micro-fingerprint.
 *
 * Algorithm:
 *   1. Truncate base amount to 3 decimal places (normalises floating point noise).
 *   2. Generate a cryptographically random 5-digit integer (10000–99999).
 *   3. Divide by 100_000_000 to produce a micro-fraction (0.00010000–0.00099999).
 *   4. Add to the truncated base → result has 8 meaningful decimal places.
 *
 * Example: base 1.52341 BNB → truncated 1.523 → fingerprint 31841
 *          → uniqueAmount = 1.523 + 0.00031841 = 1.52331841
 *
 * The buyer is shown "Pay exactly 1.52331841 BNB". The last 5 digits (31841)
 * serve as the unique order fingerprint. Overhead: max ~0.065% of base amount.
 *
 * @param {number} baseAmount - The raw calculated crypto amount
 * @returns {{ uniqueAmount: number, fingerprint: number }}
 */
function generateUniqueAmount(baseAmount) {
  // Truncate (floor) to 3 decimal places to stabilise the base
  const truncated = Math.floor(baseAmount * 1000) / 1000;

  // 5-digit fingerprint: 10000 → 99999  (always 5 digits, never 4 or 6)
  const fingerprint = crypto.randomInt(10000, 100000); // [10000, 99999]

  // Position the fingerprint at the 4th–8th decimal places
  const microFraction = fingerprint / 100_000_000; // e.g. 31841 → 0.00031841

  const uniqueAmount = parseFloat((truncated + microFraction).toFixed(8));

  return { uniqueAmount, fingerprint };
}

/**
 * Check whether the proposed uniqueAmount is truly unused among active orders.
 * Active = status 'waiting_payment' AND not yet expired.
 *
 * @param {import('pg').Pool} pool
 * @param {string} network   - 'bsc' | 'eth' | 'tron'
 * @param {string} coinType  - 'bnb' | 'usdt' | 'eth' | 'trx'
 * @param {number} uniqueAmount
 * @returns {Promise<boolean>} true if the amount is safe to use
 */
async function isAmountUnique(pool, network, coinType, uniqueAmount) {
  const { rows } = await pool.query(
    `SELECT id FROM orders
     WHERE network = $1
       AND coin_type = $2
       AND unique_crypto_amount = $3
       AND status = 'waiting_payment'
       AND expires_at > NOW()
     LIMIT 1`,
    [network, coinType, uniqueAmount.toFixed(8)]
  );
  return rows.length === 0;
}

/**
 * Attempts to generate a collision-free unique amount up to maxAttempts times.
 * A collision (same fingerprint, same coin, both pending) is astronomically rare
 * (1 in 90,000 per attempt) but we handle it gracefully.
 *
 * @param {import('pg').Pool} pool
 * @param {number} baseAmount
 * @param {string} network
 * @param {string} coinType
 * @param {number} [maxAttempts=10]
 * @returns {Promise<{ uniqueAmount: number, fingerprint: number }>}
 */
async function generateVerifiedUniqueAmount(pool, baseAmount, network, coinType, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const result = generateUniqueAmount(baseAmount);
    const safe = await isAmountUnique(pool, network, coinType, result.uniqueAmount);
    if (safe) return result;
  }
  throw new Error(
    `Failed to generate a unique amount for ${network}/${coinType} after ${maxAttempts} attempts`
  );
}

module.exports = { generateUniqueAmount, isAmountUnique, generateVerifiedUniqueAmount };
