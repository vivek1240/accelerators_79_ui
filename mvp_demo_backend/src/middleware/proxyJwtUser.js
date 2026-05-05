const jwt = require('jsonwebtoken');
const config = require('../config');

function getCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const parts = raw.split(';');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    if (k !== name) continue;
    return decodeURIComponent(p.slice(idx + 1).trim());
  }
  return null;
}

function getBearerToken(req) {
  const raw = req.headers.authorization;
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = String(m[1] || '').trim();
  return token || null;
}

/**
 * When ACCESS_TOKEN_JWT_SECRET or JWT_SECRET is set (see config), verifies
 * HttpOnly cookie `access_token` or Authorization Bearer token and sets
 * req.proxyUserId from common JWT claims. Invalid/missing token leaves
 * req.proxyUserId null — callers keep legacy behavior.
 */
function attachProxyJwtUser(req, res, next) {
  req.proxyUserId = null;
  const secret = config.accessTokenJwtSecret;
  if (!secret) return next();

  const tokens = [getCookie(req, 'access_token'), getBearerToken(req)].filter(Boolean);
  if (tokens.length === 0) return next();

  for (const token of tokens) {
    try {
      const payload = jwt.verify(token, secret);
      const id = String(
        payload.sub ?? payload.user_id ?? payload.userId ?? payload.id ?? ''
      ).trim();
      req.proxyUserId = id || null;
      if (req.proxyUserId) break;
    } catch (_) {
      // Try next token source (cookie -> bearer).
    }
  }
  next();
}

module.exports = { attachProxyJwtUser, getCookie, getBearerToken };
