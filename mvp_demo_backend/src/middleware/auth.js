const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');

/** Require valid Bearer JWT; set req.user (plain object). */
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({
      detail: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
    });
  }
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.sub);
    if (!user) {
      return res.status(401).json({
        detail: { code: 'USER_NOT_FOUND', message: 'User no longer exists' },
      });
    }
    req.user = {
      user_id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      is_allowed: user.is_allowed,
    };
    next();
  } catch (err) {
    return res.status(401).json({
      detail: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
    });
  }
}

/** Require req.user.is_allowed (use after requireAuth). */
function requireAllowed(req, res, next) {
  if (!req.user || !req.user.is_allowed) {
    return res.status(403).json({
      detail: { code: 'ACCESS_DENIED', message: 'Ask admin for access.' },
    });
  }
  next();
}

/** Require req.user.role === 'admin' (use after requireAuth). */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      detail: { code: 'ADMIN_REQUIRED', message: 'Admin access required.' },
    });
  }
  next();
}

module.exports = { requireAuth, requireAllowed, requireAdmin };
