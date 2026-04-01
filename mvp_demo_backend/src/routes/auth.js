const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');

const router = express.Router();

/** Stable dummy id from email (no DB). */
function emailToDummyUserId(email) {
  const norm = (email || '').trim().toLowerCase() || 'anonymous';
  return crypto.createHash('sha256').update(norm).digest('hex').slice(0, 24);
}

function dummyAuthResponse({ email, name, isSignup }) {
  const emailNorm = (email || '').trim().toLowerCase();
  const userId = emailToDummyUserId(emailNorm);
  const token = jwt.sign(
    { sub: userId, email: emailNorm || 'user@local' },
    config.jwtSecret,
    { expiresIn: `${config.jwtExpireDays}d` }
  );
  return {
    access_token: token,
    token_type: 'bearer',
    user_id: userId,
    email: emailNorm || 'user@local',
    name: isSignup ? (name || '').trim() || null : emailNorm ? emailNorm.split('@')[0] : 'User',
    role: 'user',
    is_allowed: true,
  };
}

/** POST /auth/signup — dummy: no DB, always succeeds when validation passes */
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    const emailNorm = (email || '').trim().toLowerCase();
    if (!emailNorm || !password || password.length < 6) {
      return res.status(400).json({
        detail: { code: 'VALIDATION_ERROR', message: 'Email and password (min 6) required.' },
      });
    }
    return res.json(dummyAuthResponse({ email: emailNorm, name, isSignup: true }));
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(503).json({
      detail: { code: 'AUTH_ERROR', message: 'Signup failed.', debug: String(err.message) },
    });
  }
});

/** POST /auth/login — dummy: no DB verification */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const emailNorm = (email || '').trim().toLowerCase();
    if (!emailNorm || !password) {
      return res.status(400).json({
        detail: { code: 'VALIDATION_ERROR', message: 'Email and password required.' },
      });
    }
    return res.json(dummyAuthResponse({ email: emailNorm, isSignup: false }));
  } catch (err) {
    console.error('Login error:', err);
    return res.status(503).json({
      detail: { code: 'AUTH_ERROR', message: 'Login failed.', debug: String(err.message) },
    });
  }
});

/** GET /auth/users — list users (Mongo), no auth gate */
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).lean();
    const list = users.map((u) => {
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

/** PATCH /auth/users/:user_id/access — no auth gate */
router.patch('/users/:user_id/access', async (req, res) => {
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
