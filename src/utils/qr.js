'use strict';
const QRCode = require('qrcode');

/**
 * Generate a QR code PNG buffer from a wallet address.
 * Used by the Telegram bot when showing wallet details.
 *
 * @param {string} address - Plain wallet address (no URI scheme)
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateQR(address) {
  return QRCode.toBuffer(address, {
    errorCorrectionLevel: 'M',
    type: 'png',
    width: 300,
    margin: 2,
    color: {
      dark:  '#1a1a2e',
      light: '#ffffff',
    },
  });
}

/**
 * Generate QR as a base64 data URL for embedding in HTML/frontend.
 * @param {string} address
 * @returns {Promise<string>} data:image/png;base64,...
 */
async function generateQRDataUrl(address) {
  return QRCode.toDataURL(address, {
    errorCorrectionLevel: 'M',
    width: 300,
    margin: 2,
  });
}

module.exports = { generateQR, generateQRDataUrl };
