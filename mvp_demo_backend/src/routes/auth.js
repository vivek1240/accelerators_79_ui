const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const BCRYPT_MAX_BYTES = 72;

function truncateForBcrypt(str) {
  const buf = Buffer.from(str, 'utf8').subarray(0, BCRYPT_MAX_BYTES);
  return buf.toString('utf8');
}

function createToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email },
    config.jwtSecret,
    { expiresIn: `${config.jwtExpireDays}d` }
  );
}

function toTokenResponse(user, token) {
  return {
    access_token: token,
    token_type: 'bearer',
    user_id: user._id.toString(),
    email: user.email,
    name: user.name ?? null,
    role: user.role || 'user',
    is_allowed: user.is_allowed ?? false,
  };
}

/** POST /auth/signup */
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    const emailNorm = (email || '').trim().toLowerCase();
    if (!emailNorm || !password || password.length < 6) {
      return res.status(400).json({
        detail: { code: 'VALIDATION_ERROR', message: 'Email and password (min 6) required.' },
      });
    }
    const existing = await User.findOne({ email: emailNorm });
    if (existing) {
      return res.status(400).json({
        detail: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' },
      });
    }
    const hashed = await bcrypt.hash(truncateForBcrypt(password), 10);
    const user = await User.create({
      email: emailNorm,
      hashed_password: hashed,
      name: (name || '').trim() || null,
      role: 'user',
      is_allowed: false,
    });
    const token = createToken(user);
    return res.json(toTokenResponse(user, token));
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(503).json({
      detail: { code: 'AUTH_ERROR', message: 'Signup failed.', debug: String(err.message) },
    });
  }
});

/** POST /auth/login */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const emailNorm = (email || '').trim().toLowerCase();
    if (!emailNorm || !password) {
      return res.status(400).json({
        detail: { code: 'VALIDATION_ERROR', message: 'Email and password required.' },
      });
    }
    const user = await User.findOne({ email: emailNorm });
    if (!user || !(await bcrypt.compare(truncateForBcrypt(password), user.hashed_password))) {
      return res.status(401).json({
        detail: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }
    const token = createToken(user);
    return res.json(toTokenResponse(user, token));
  } catch (err) {
    console.error('Login error:', err);
    return res.status(503).json({
      detail: { code: 'AUTH_ERROR', message: 'Login failed.', debug: String(err.message) },
    });
  }
});

/** GET /auth/users (admin only) */
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).lean();
    const list = users.map((u) => {
      // Handle createdAt whether it's a Date object, string, or MongoDB $date format
      let createdAt = null;
      if (u.createdAt) {
        if (typeof u.createdAt.toISOString === 'function') {
          createdAt = u.createdAt.toISOString();
        } else if (u.createdAt.$date) {
          createdAt = u.createdAt.$date;
        } else {
          createdAt = String(u.createdAt);
        }
      }
      return {
        user_id: u._id.toString(),
        email: u.email,
        name: u.name ?? null,
        role: u.role || 'user',
        is_allowed: u.is_allowed ?? false,
        created_at: createdAt,
      };
    });
    return res.json(list);
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ detail: { code: 'SERVER_ERROR', message: String(err.message) } });
  }
});

/** PATCH /auth/users/:user_id/access (admin only) */
router.patch('/users/:user_id/access', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { user_id } = req.params;
    const { is_allowed } = req.body || {};
    if (typeof is_allowed !== 'boolean') {
      return res.status(400).json({
        detail: { code: 'VALIDATION_ERROR', message: 'body.is_allowed (boolean) required.' },
      });
    }
    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({
        detail: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }
    user.is_allowed = is_allowed;
    await user.save();
    return res.json({ user_id, is_allowed: user.is_allowed });
  } catch (err) {
    console.error('Set access error:', err);
    return res.status(500).json({ detail: { code: 'SERVER_ERROR', message: String(err.message) } });
  }
});

module.exports = router;
