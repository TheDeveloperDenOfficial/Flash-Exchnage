'use strict';
const config = require('../../config');

/**
 * HTTP Basic Authentication middleware.
 * Protects admin routes with credentials from environment variables.
 */
function basicAuth(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Flash Exchange Admin"');
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Decode base64 credentials
  const base64 = authHeader.slice('Basic '.length);
  const decoded = Buffer.from(base64, 'base64').toString('utf8');
  const colonIndex = decoded.indexOf(':');

  if (colonIndex === -1) {
    return res.status(401).json({ error: 'Invalid credentials format' });
  }

  const username = decoded.slice(0, colonIndex);
  const password = decoded.slice(colonIndex + 1);

  // Timing-safe comparison to prevent timing attacks
  const validUser = timingSafeEqual(username, config.adminUsername);
  const validPass = timingSafeEqual(password, config.adminPassword);

  if (!validUser || !validPass) {
    res.set('WWW-Authenticate', 'Basic realm="Flash Exchange Admin"');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  next();
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a).padEnd(256, '\0'));
  const bufB = Buffer.from(String(b).padEnd(256, '\0'));
  // require('crypto').timingSafeEqual needs equal length buffers
  const { timingSafeEqual: tse } = require('crypto');
  return tse(bufA.slice(0, 256), bufB.slice(0, 256)) && a.length === b.length;
}

module.exports = basicAuth;
