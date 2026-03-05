'use strict';
const crypto = require('crypto');

/**
 * Generates a unique fingerprinted crypto amount.
 *
 * Algorithm:
 *   base = usdAmount / coinPriceUSD
 *   truncated = floor(base × 1000) / 1000       → 3 decimal places
 *   fingerprint = randomInt(10000, 99999)         → 5 digit suffix
 *   uniqueAmount = truncated + fingerprint/1e8    → e.g. 0.14231841
 *
 * The last 5 digits serve as the order's unique fingerprint.
 * Max overhead: ~0.001% of base amount.
 */
function generateUniqueAmount(baseAmount) {
  const truncated    = Math.floor(baseAmount * 1000) / 1000;
  const fingerprint  = crypto.randomInt(10000, 100000); // 10000–99999
  const microFraction = fingerprint / 100_000_000;
  const uniqueAmount  = parseFloat((truncated + microFraction).toFixed(8));
  return { uniqueAmount, fingerprint };
}

/**
 * Check if the uniqueAmount is already used by another active pending order.
 */
async function isAmountUnique(pool, network, coinSymbol, uniqueAmount) {
  const { rows } = await pool.query(
    `SELECT id FROM orders
     WHERE network = $1
       AND coin_symbol = $2
       AND unique_crypto_amount = $3
       AND status = 'waiting_payment'
       AND expires_at > NOW()
     LIMIT 1`,
    [network, coinSymbol, uniqueAmount.toFixed(8)]
  );
  return rows.length === 0;
}

/**
 * Generate and verify — retry up to maxAttempts on collision.
 * Collision probability: ~1 in 90,000 per attempt.
 */
async function generateVerifiedUniqueAmount(pool, baseAmount, network, coinSymbol, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const result = generateUniqueAmount(baseAmount);
    if (await isAmountUnique(pool, network, coinSymbol, result.uniqueAmount)) {
      return result;
    }
  }
  throw new Error(`Could not generate unique amount after ${maxAttempts} attempts`);
}

module.exports = { generateVerifiedUniqueAmount };
