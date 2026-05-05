/**
 * Lightweight smoke test: Mongo + Node proxy (no FastAPI required for ownership / library checks).
 *
 * Run from repo:
 *   cd mvp_demo/mvp_demo_backend && node scripts/smoke-e2e.js
 *
 * Requires MongoDB reachable at MONGODB_URI (default mongodb://127.0.0.1:27017/smoke_ar_e2e).
 */
const http = require('http');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smoke_ar_e2e';
const PORT = parseInt(process.env.SMOKE_PORT || '14022', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'smoke-e2e-jwt-secret';
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:19998';

function req(method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request(
      { hostname: '127.0.0.1', port: PORT, path, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, body });
        });
      }
    );
    r.on('error', reject);
    r.end();
  });
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const UserUpload = require('../src/models/UserUpload');
  await UserUpload.deleteMany({ userId: 'smoke-e2e-user' });
  await UserUpload.create({
    userId: 'smoke-e2e-user',
    fileId: 'smoke-owned-file-id',
    filename: 'smoke.pdf',
    memoryId: null,
  });
  await mongoose.disconnect();

  const env = {
    ...process.env,
    PORT: String(PORT),
    MONGODB_URI,
    FASTAPI_URL,
    FASTAPI_API_KEY: '',
    JWT_SECRET,
    ACCESS_TOKEN_JWT_SECRET: '',
    ANONYMOUS_USER_ID: 'anon-smoke',
  };

  const child = spawn('node', ['src/index.js'], {
    cwd: require('path').join(__dirname, '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let out = '';
  child.stdout.on('data', (d) => {
    out += d.toString();
  });
  child.stderr.on('data', (d) => {
    out += d.toString();
  });

  const stop = () => {
    try {
      child.kill('SIGTERM');
    } catch (_) {}
  };

  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('server start timeout')), 15000);
      const iv = setInterval(() => {
        if (out.includes('listening on port')) {
          clearInterval(iv);
          clearTimeout(t);
          resolve();
        }
      }, 100);
    });
  } catch (e) {
    stop();
    throw e;
  }

  try {
    const h = await req('GET', '/health');
    if (h.status !== 200) throw new Error(`health ${h.status}: ${h.body}`);

    const u = await req('GET', '/user-uploads?user_id=smoke-e2e-user');
    if (u.status !== 200) throw new Error(`user-uploads ${u.status}: ${u.body}`);
    const uj = JSON.parse(u.body);
    if (!uj.success || !Array.isArray(uj.data.files)) throw new Error('user-uploads shape');
    const found = uj.data.files.some((f) => f.file_id === 'smoke-owned-file-id');
    if (!found) throw new Error('user-uploads missing seeded file');

    const token = jwt.sign({ sub: 'smoke-e2e-user' }, JWT_SECRET, { expiresIn: '1h' });
    const wrong = await req('GET', '/status/not-owned-file-id', {
      Cookie: `access_token=${token}`,
    });
    if (wrong.status !== 403) {
      throw new Error(`expected 403 for wrong file with cookie, got ${wrong.status}: ${wrong.body}`);
    }

    const owned = await req('GET', '/status/smoke-owned-file-id', {
      Cookie: `access_token=${token}`,
    });
    if (owned.status === 200) {
      throw new Error('unexpected 200 from status (FastAPI should not be up in smoke)');
    }

    const wrongBearer = await req('GET', '/status/not-owned-file-id', {
      Authorization: `Bearer ${token}`,
    });
    if (wrongBearer.status !== 403) {
      throw new Error(
        `expected 403 for wrong file with bearer, got ${wrongBearer.status}: ${wrongBearer.body}`
      );
    }
  } finally {
    stop();
    await new Promise((r) => setTimeout(r, 500));
  }

  await mongoose.connect(MONGODB_URI);
  await UserUpload.deleteMany({ userId: 'smoke-e2e-user' });
  await mongoose.disconnect();

  console.log('smoke-e2e: OK (health, user-uploads, JWT file 403)');
}

main().catch((e) => {
  console.error('smoke-e2e FAILED:', e.message);
  process.exit(1);
});
