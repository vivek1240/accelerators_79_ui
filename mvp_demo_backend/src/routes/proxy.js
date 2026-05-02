const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const multer = require('multer');
const config = require('../config');
const { attachProxyJwtUser } = require('../middleware/proxyJwtUser');
const UserUpload = require('../models/UserUpload');
const {
  assertFileOwnedByProxyUser,
  assertMagBodyFileAccess,
  mergeProxyUserIntoBody,
  mergeProxyUserIntoQuery,
} = require('../lib/proxyFileAccess');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(attachProxyJwtUser);

/** Prefer JWT cookie user id when verified; else legacy form/query user_id. */
function resolveUserIdFromUpload(req) {
  if (req.proxyUserId) return req.proxyUserId;
  const fromClient =
    req.body?.user_id != null && String(req.body.user_id).trim() !== ''
      ? String(req.body.user_id).trim()
      : '';
  return fromClient || config.anonymousUserId || '';
}

async function persistUserUpload(userId, payload) {
  if (!userId || !payload?.file_id) return;
  try {
    await UserUpload.findOneAndUpdate(
      { userId, fileId: payload.file_id },
      {
        $set: {
          filename: payload.filename || '',
          memoryId: payload.memory_id != null ? String(payload.memory_id) : null,
          pagesCount: payload.pages_count != null ? Number(payload.pages_count) : null,
          filteredPagesCount:
            payload.filtered_pages_count != null ? Number(payload.filtered_pages_count) : null,
          parsed: payload.parsed != null ? Boolean(payload.parsed) : null,
          uploadStatus: payload.status != null ? String(payload.status) : null,
        },
      },
      { upsert: true }
    );
  } catch (e) {
    console.warn('[proxy] UserUpload persist failed:', e.message);
  }
}

if (!config.fastapiUrl) {
  console.warn('FASTAPI_URL not set; proxy routes (edgar, extract, rag, etc.) will fail.');
}

const fastapi = axios.create({
  baseURL: config.fastapiUrl,
  timeout: 300000,
  headers: {
    'X-API-Key': config.fastapiApiKey,
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});

/** Forward JSON body to FastAPI POST /route */
router.post(
  '/route',
  express.json(),
  async (req, res) => {
    try {
      const { data } = await fastapi.post('/route', req.body, {
        headers: { 'Content-Type': 'application/json' },
      });
      res.json(data);
    } catch (err) {
      const status = err.response?.status || 502;
      const body = err.response?.data ?? { detail: { message: err.message } };
      res.status(status).json(body);
    }
  }
);

/** Forward multipart upload to FastAPI POST /upload */
router.post(
  '/upload',
  upload.single('file'),
  async (req, res) => {
    try {
      const form = new FormData();
      if (req.file) {
        form.append('file', req.file.buffer, { filename: req.file.originalname || 'file.pdf' });
      }
      const userId = resolveUserIdFromUpload(req);
      form.append('user_id', userId);
      if (req.body?.metadata) form.append('metadata', req.body.metadata);
      const { data } = await fastapi.post('/upload', form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      if (data?.success && data?.data?.file_id) {
        await persistUserUpload(userId, data.data);
      }
      res.json(data);
    } catch (err) {
      const status = err.response?.status || 502;
      const body = err.response?.data ?? { detail: { message: err.message } };
      res.status(status).json(body);
    }
  }
);

/** GET /status/:file_id */
router.get('/status/:file_id', async (req, res) => {
  try {
    const denied = await assertFileOwnedByProxyUser(req, req.params.file_id);
    if (denied) return res.status(denied.status).json(denied.json);
    const { data } = await fastapi.get(`/status/${req.params.file_id}`);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data ?? {});
  }
});

/** GET /pages/:file_id */
router.get('/pages/:file_id', async (req, res) => {
  try {
    const denied = await assertFileOwnedByProxyUser(req, req.params.file_id);
    if (denied) return res.status(denied.status).json(denied.json);
    const { data } = await fastapi.get(`/pages/${req.params.file_id}`);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data ?? {});
  }
});

/** GET /pages/:file_id/preview-by-page/:page_number (returns blob; 1-based PDF page) */
router.get('/pages/:file_id/preview-by-page/:page_number', async (req, res) => {
  try {
    const denied = await assertFileOwnedByProxyUser(req, req.params.file_id);
    if (denied) return res.status(denied.status).json(denied.json);
    const r = await fastapi.get(
      `/pages/${req.params.file_id}/preview-by-page/${req.params.page_number}`,
      { responseType: 'arraybuffer' }
    );
    const contentType = r.headers['content-type'] || 'application/octet-stream';
    res.set('Content-Type', contentType);
    res.send(Buffer.from(r.data));
  } catch (err) {
    res.status(err.response?.status || 502).send(err.response?.data ?? '');
  }
});

/** GET /pages/:file_id/:page_index/preview (returns blob) */
router.get('/pages/:file_id/:page_index/preview', async (req, res) => {
  try {
    const denied = await assertFileOwnedByProxyUser(req, req.params.file_id);
    if (denied) return res.status(denied.status).json(denied.json);
    const r = await fastapi.get(
      `/pages/${req.params.file_id}/${req.params.page_index}/preview`,
      { responseType: 'arraybuffer' }
    );
    const contentType = r.headers['content-type'] || 'application/octet-stream';
    res.set('Content-Type', contentType);
    res.send(Buffer.from(r.data));
  } catch (err) {
    res.status(err.response?.status || 502).send(err.response?.data ?? '');
  }
});

/** POST /extract */
router.post(
  '/extract',
  express.json(),
  async (req, res) => {
    try {
      const denied = await assertFileOwnedByProxyUser(req, req.body?.file_id);
      if (denied) return res.status(denied.status).json(denied.json);
      const { data } = await fastapi.post('/extract', req.body);
      res.json(data);
    } catch (err) {
      res.status(err.response?.status || 502).json(err.response?.data ?? {});
    }
  }
);

/** POST /analyze — LLM narration of pre-computed table insights */
router.post(
  '/analyze',
  express.json(),
  async (req, res) => {
    try {
      const { data } = await fastapi.post('/analyze', req.body);
      res.json(data);
    } catch (err) {
      res.status(err.response?.status || 502).json(err.response?.data ?? {});
    }
  }
);

/** GET /edgar/:ticker */
router.get('/edgar/:ticker', async (req, res) => {
  try {
    const { data } = await fastapi.get(`/edgar/${req.params.ticker}`, {
      params: req.query,
    });
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data ?? {});
  }
});

/**
 * GET /user-uploads — PDFs recorded for this user (Mongo), keyed by FastAPI file_id.
 * When ACCESS_TOKEN_JWT_SECRET is set, requires valid `access_token` cookie (no ?user_id=).
 * Otherwise supports ?user_id= for local/dev; cookie still used if present and JWT_SECRET verifies it.
 */
router.get('/user-uploads', async (req, res) => {
  try {
    const strict = Boolean(config.userUploadsRequireCookie);
    const fromCookie = req.proxyUserId;
    const fromQuery =
      req.query.user_id != null && String(req.query.user_id).trim() !== ''
        ? String(req.query.user_id).trim()
        : null;

    let userId;
    if (strict) {
      if (!fromCookie) {
        return res.status(401).json({
          success: false,
          data: { files: [] },
          detail: {
            code: 'AUTH_REQUIRED',
            message: 'Valid access_token cookie required to list uploads.',
          },
        });
      }
      userId = fromCookie;
    } else {
      userId = fromCookie || fromQuery;
      if (!userId) {
        return res.json({ success: true, data: { files: [], user_id: null } });
      }
    }

    const rows = await UserUpload.find({ userId }).sort({ createdAt: -1 }).lean();
    const files = rows.map((r) => ({
      file_id: r.fileId,
      filename: r.filename || '',
      memory_id: r.memoryId || null,
      created_at: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      pages_count: r.pagesCount != null ? r.pagesCount : null,
      filtered_pages_count: r.filteredPagesCount != null ? r.filteredPagesCount : null,
      parsed: r.parsed != null ? r.parsed : null,
      status: r.uploadStatus != null ? r.uploadStatus : null,
    }));
    return res.json({ success: true, data: { files, user_id: userId } });
  } catch (err) {
    console.error('GET /user-uploads', err);
    return res.status(500).json({
      success: false,
      data: { files: [] },
      detail: { message: err.message || 'List failed' },
    });
  }
});

/** GET /documents */
router.get('/documents', async (req, res) => {
  try {
    const { data } = await fastapi.get('/documents', { params: req.query });
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data ?? {});
  }
});

/** GET /filters */
router.get('/filters', async (req, res) => {
  try {
    const { data } = await fastapi.get('/filters', { params: req.query });
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data ?? {});
  }
});

/** DELETE /files/:file_id */
router.delete('/files/:file_id', async (req, res) => {
  try {
    const denied = await assertFileOwnedByProxyUser(req, req.params.file_id);
    if (denied) return res.status(denied.status).json(denied.json);
    const { data } = await fastapi.delete(`/files/${req.params.file_id}`);
    if (data?.success !== false) {
      try {
        if (req.proxyUserId) {
          await UserUpload.deleteOne({
            userId: req.proxyUserId,
            fileId: req.params.file_id,
          });
        } else {
          await UserUpload.deleteOne({ fileId: req.params.file_id });
        }
      } catch (e) {
        console.warn('[proxy] UserUpload delete failed:', e.message);
      }
    }
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data ?? {});
  }
});

// ── MAG (Memory-Augmented Generation) endpoints ──

/** GET /mag/memories */
router.get('/mag/memories', async (req, res) => {
  try {
    const params = mergeProxyUserIntoQuery(req, req.query);
    const { data } = await fastapi.get('/mag/memories', { params });
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data ?? {});
  }
});

/** POST /mag/query — non-streaming */
router.post(
  '/mag/query',
  express.json(),
  async (req, res) => {
    try {
      const denied = await assertMagBodyFileAccess(req, req.body);
      if (denied) return res.status(denied.status).json(denied.json);
      const body = mergeProxyUserIntoBody(req, req.body);
      const { data } = await fastapi.post('/mag/query', body);
      res.json(data);
    } catch (err) {
      res.status(err.response?.status || 502).json(err.response?.data ?? {});
    }
  }
);

/** POST /mag/query/stream — SSE pass-through */
router.post(
  '/mag/query/stream',
  express.json(),
  async (req, res) => {
    try {
      const denied = await assertMagBodyFileAccess(req, req.body);
      if (denied) return res.status(denied.status).json(denied.json);
      const body = mergeProxyUserIntoBody(req, req.body);
      const response = await fastapi.post('/mag/query/stream', body, {
        responseType: 'stream',
        timeout: 300000,
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      });
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      });
      response.data.pipe(res);
    } catch (err) {
      const status = err.response?.status || 502;
      const body = err.response?.data ?? { detail: { message: err.message } };
      res.status(status).json(body);
    }
  }
);

module.exports = router;
