require('dotenv').config();

// Force http for localhost to avoid EPROTO "packet length too long" (SSL vs plain HTTP)
function normalizeFastapiUrl(url) {
  const u = (url || '').replace(/\/$/, '');
  if (!u) return u;
  try {
    const parsed = new URL(u);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      parsed.protocol = 'http:';
      return parsed.toString();
    }
  } catch (_) {}
  return u;
}

module.exports = {
  port: parseInt(process.env.PORT || '4000', 10),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/mvp_demo',
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpireDays: parseInt(process.env.JWT_EXPIRE_DAYS || '7', 10),
  /**
   * If non-empty, proxy verifies HttpOnly cookie `access_token` (HS256).
   * Uses ACCESS_TOKEN_JWT_SECRET first, then JWT_SECRET so one var can enable verification.
   */
  accessTokenJwtSecret: (
    process.env.ACCESS_TOKEN_JWT_SECRET ||
    process.env.JWT_SECRET ||
    ''
  ).trim(),
  /** When true, GET /user-uploads requires a valid cookie (no ?user_id=). Set by defining ACCESS_TOKEN_JWT_SECRET. */
  userUploadsRequireCookie: Boolean((process.env.ACCESS_TOKEN_JWT_SECRET || '').trim()),
  fastapiUrl: normalizeFastapiUrl(process.env.FASTAPI_URL),
  fastapiApiKey: process.env.FASTAPI_API_KEY || '',
  /** Forwarded to FastAPI upload/query when not using per-user auth */
  anonymousUserId: process.env.ANONYMOUS_USER_ID || '',
};
