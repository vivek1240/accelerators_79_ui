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

/**
 * When ACCESS_TOKEN_JWT_SECRET or JWT_SECRET is set (see config), verifies
 * HttpOnly cookie `access_token` and sets req.proxyUserId from common JWT claims.
 * Invalid/missing cookie leaves req.proxyUserId null — callers keep legacy behavior.
 */
function attachProxyJwtUser(req, res, next) {
  req.proxyUserId = null;
  const secret = config.accessTokenJwtSecret;
  if (!secret) return next();

  const token = getCookie(req, 'access_token');
  if (!token) return next();

  try {
    const payload = jwt.verify(token, secret);
    const id = String(
      payload.sub ?? payload.user_id ?? payload.userId ?? payload.id ?? ''
    ).trim();
    req.proxyUserId = id || null;
  } catch (_) {
    req.proxyUserId = null;
  }
  next();
}

module.exports = { attachProxyJwtUser, getCookie };
