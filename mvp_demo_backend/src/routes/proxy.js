const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const multer = require('multer');
const config = require('../config');
const { requireAuth, requireAllowed } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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

/** All proxy routes require auth + is_allowed (except health which we expose ourselves or proxy). */
const requireAllowedForProxy = [requireAuth, requireAllowed];

/** Forward JSON body to FastAPI POST /route */
router.post(
  '/route',
  requireAllowedForProxy,
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
  requireAllowedForProxy,
  upload.single('file'),
  async (req, res) => {
    try {
      const form = new FormData();
      if (req.file) {
        form.append('file', req.file.buffer, { filename: req.file.originalname || 'file.pdf' });
      }
      // FastAPI /upload requires user_id (Form)
      form.append('user_id', req.user?.user_id ?? '');
      if (req.body?.metadata) form.append('metadata', req.body.metadata);
      const { data } = await fastapi.post('/upload', form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      res.json(data);
    } catch (err) {
      const status = err.response?.status || 502;
      const body = err.response?.data ?? { detail: { message: err.message } };
      res.status(status).json(body);
    }
  }
);

/** GET /status/:file_id */
router.get('/status/:file_id', requireAllowedForProxy, async (req, res) => {
  try {
    const { data } = await fastapi.get(`/status/${req.params.file_id}`);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data ?? {});
  }
});

/** GET /pages/:file_id */
router.get('/pages/:file_id', requireAllowedForProxy, async (req, res) => {
  try {
    const { data } = await fastapi.get(`/pages/${req.params.file_id}`);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data ?? {});
  }
});

/** GET /pages/:file_id/:page_index/preview (returns blob) */
router.get('/pages/:file_id/:page_index/preview', requireAllowedForProxy, async (req, res) => {
  try {
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
  requireAllowedForProxy,
  express.json(),
  async (req, res) => {
    try {
      const { data } = await fastapi.post('/extract', req.body);
      res.json(data);
    } catch (err) {
      res.status(err.response?.status || 502).json(err.response?.data ?? {});
    }
  }
);

/** POST /query - FastAPI requires file_id, user_id, question; inject user_id from auth */
router.post(
  '/query',
  requireAllowedForProxy,
  express.json(),
  async (req, res) => {
    try {
      const body = { ...req.body, user_id: req.user?.user_id ?? '' };
      const { data } = await fastapi.post('/query', body);
      res.json(data);
    } catch (err) {
      res.status(err.response?.status || 502).json(err.response?.data ?? {});
    }
  }
);

/** GET /edgar/:ticker */
router.get('/edgar/:ticker', requireAllowedForProxy, async (req, res) => {
  try {
    const { data } = await fastapi.get(`/edgar/${req.params.ticker}`, {
      params: req.query,
    });
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data ?? {});
  }
});

/** GET /documents */
router.get('/documents', requireAllowedForProxy, async (req, res) => {
  try {
    const { data } = await fastapi.get('/documents', { params: req.query });
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data ?? {});
  }
});

/** GET /filters */
router.get('/filters', requireAllowedForProxy, async (req, res) => {
  try {
    const { data } = await fastapi.get('/filters', { params: req.query });
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data ?? {});
  }
});

/** DELETE /files/:file_id */
router.delete('/files/:file_id', requireAllowedForProxy, async (req, res) => {
  try {
    const { data } = await fastapi.delete(`/files/${req.params.file_id}`);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data ?? {});
  }
});

module.exports = router;
