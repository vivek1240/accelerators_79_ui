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
  fastapiUrl: normalizeFastapiUrl(process.env.FASTAPI_URL),
  fastapiApiKey: process.env.FASTAPI_API_KEY || '',
};
