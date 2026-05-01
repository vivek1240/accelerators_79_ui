const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const multer = require('multer');
const config = require('../config');

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
      // FastAPI /upload requires user_id (Form); prefer client-provided id (e.g. per-page-load from UI)
      const fromClient = req.body?.user_id != null && String(req.body.user_id).trim() !== ''
        ? String(req.body.user_id).trim()
        : '';
      const userId = fromClient || config.anonymousUserId;
      form.append('user_id', userId);
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
router.get('/status/:file_id', async (req, res) => {
  try {
    const { data } = await fastapi.get(`/status/${req.params.file_id}`);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data ?? {});
  }
});

/** GET /pages/:file_id */
router.get('/pages/:file_id', async (req, res) => {
  try {
    const { data } = await fastapi.get(`/pages/${req.params.file_id}`);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data ?? {});
  }
});

/** GET /pages/:file_id/preview-by-page/:page_number (returns blob; 1-based PDF page) */
router.get('/pages/:file_id/preview-by-page/:page_number', async (req, res) => {
  try {
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
    const { data } = await fastapi.delete(`/files/${req.params.file_id}`);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data ?? {});
  }
});

// ── MAG (Memory-Augmented Generation) endpoints ──

/** GET /mag/memories */
router.get('/mag/memories', async (req, res) => {
  try {
    const { data } = await fastapi.get('/mag/memories', { params: req.query });
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
      const { data } = await fastapi.post('/mag/query', req.body);
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
      const response = await fastapi.post('/mag/query/stream', req.body, {
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
