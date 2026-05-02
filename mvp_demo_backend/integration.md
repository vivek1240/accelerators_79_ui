# Proxy integration guide

**Smoke test (local Mongo required):** from `mvp_demo/mvp_demo_backend` run `npm run smoke` — checks `/health`, `/user-uploads`, and JWT **403** on wrong `file_id` without needing FastAPI.

This document describes how a **browser or server client** integrates with the **MVP demo Node backend** (`mvp_demo_backend`). The Node app **proxies** to the **FastAPI agentic-router** and adds **JWT cookie handling**, **per-user upload indexing** (Mongo), and **file access checks**.

**Base URL:** your deployed backend origin, e.g. `https://api.example.com`, or local `http://localhost:4000` (see `PORT` in `.env`).

**Path prefix:** routes below are **root-relative** on that host (`POST /upload`, not `/api/upload`), unless you mount this app behind a prefix (then prepend it everywhere).

---

## 1. HTTP client setup (required for auth cookies)

- Use **`fetch(..., { credentials: 'include' })`** or **Axios `withCredentials: true`** so the browser sends the **`access_token`** HttpOnly cookie on cross-origin requests (when your UI and API are on different subdomains).
- Backend uses **`cors({ origin: true, credentials: true })`** so allowed origins reflect the request origin.

---

## 2. Authentication and user identity

| Mechanism | Purpose |
|-----------|---------|
| **`access_token` cookie** | Your auth service (e.g. Google OAuth) sets HttpOnly JWT. The proxy verifies it when `ACCESS_TOKEN_JWT_SECRET` or `JWT_SECRET` is configured (HS256). |
| **`req.proxyUserId`** | Derived from JWT claims: `sub`, `user_id`, `userId`, or `id`. |

**Upload `user_id`:** If the cookie verifies, **`POST /upload` sends that user id to FastAPI** and ignores a spoofed form `user_id`. If there is no valid cookie, the proxy falls back to **form field `user_id`** or `ANONYMOUS_USER_ID` (legacy / dev).

**Strict library listing:** If **`ACCESS_TOKEN_JWT_SECRET`** is set, **`GET /user-uploads`** requires a valid cookie (**401** without it). If it is unset, **`?user_id=`** is allowed for local testing.

**Emergency bypass (not for production):** `PROXY_SKIP_FILE_OWNERSHIP=true` disables Mongo ownership checks on file-scoped routes.

---

## 3. Recommended integration flow (PDF + extractor + chatbot)

1. **Sign in** (your app’s auth) so **`access_token`** is set for the API origin.
2. **`POST /upload`** — multipart `file` (+ optional `metadata` string). Save returned **`data.file_id`** (and poll **`GET /status/:file_id`** until ready).
3. **`GET /user-uploads`** — list allowed **`file_id`s** for the current user (drives document picker).
4. **`GET /pages/:file_id`** — table-prefiltered pages for the extractor UI.
5. **`POST /extract`** — JSON `{ "file_id", "page_indices": [...] }` (0-based indices from `/pages`).
6. **Advanced chatbot (MAG)** — **`GET /mag/memories`** then **`POST /mag/query`** or **`POST /mag/query/stream`** (see §6).

---

## 4. Health

| Method | Path | Description |
|--------|------|-------------|
| **GET** | `/health` | `{ status, service, mongodb }` — Node + Mongo connectivity (not proxied to FastAPI). |

---

## 5. Auth routes (Node-only; optional for your product)

Mounted under **`/auth`**. Your production app may use a **different** auth service; these exist for the bundled demo.

| Method | Path | Body | Notes |
|--------|------|------|------|
| **POST** | `/auth/signup` | `{ name?, email, password }` | Demo response includes `access_token` in JSON (not always cookie). |
| **POST** | `/auth/login` | `{ email, password }` | Same. |
| **GET** | `/auth/users` | — | Lists Mongo users (admin tooling; open in demo). |
| **PATCH** | `/auth/users/:id/access` | `{ is_allowed }` | Demo admin. |

---

## 6. Advanced chatbot — **MAG (Memory-Augmented Generation)** (highlight)

MAG is the **“analyst memory”** chat: answers are grounded in **ingested PDF analyst memory**, not generic RAG chunks. After **`POST /upload`**, FastAPI runs **MAG ingestion** in the background; use **`GET /status/:file_id`** until MAG is ready, then chat.

### 6.1 List analyst memories

| Method | Path | Query | Proxy behavior |
|--------|------|-------|----------------|
| **GET** | `/mag/memories` | `user_id` (optional) | If JWT cookie verifies, **`user_id` is forced from the token** (query override for security). |

**FastAPI response shape:** `{ success, data: { memories: [...], mag_available } }` — each memory has `memory_id`, `doc_title`, etc.

### 6.2 Chat (non-streaming)

| Method | Path | Body (JSON) | Proxy behavior |
|--------|------|-------------|----------------|
| **POST** | `/mag/query` | See FastAPI `MAGQueryRequest` | If body contains **`file_id`**, proxy checks that **`file_id` belongs to the cookie user** in Mongo (`UserUpload`). **`user_id` in JSON is set from JWT** when the cookie verifies (so memory resolution uses the correct tenant). |

**Typical body fields:**

- **`question`** (required) — user message.
- **`file_id`** + **`user_id`** — proxy supplies **`user_id`** when cookie is present; backend resolves **`memory_id`** from `user_id` + `file_id` when `memory_id` / `memory_ids` omitted.
- **`memory_id`** or **`memory_ids`** — optional explicit analyst memory ids.
- **`session_id`** — default `"default"`; use per-thread ids for parallel chats.
- **`deep_thinking`** — boolean, default `true`.

**Response:** `{ success, data: { answer, route, model, latency_ms } }`.

### 6.3 Chat (streaming SSE)

| Method | Path | Body | Notes |
|--------|------|------|------|
| **POST** | `/mag/query/stream` | Same JSON as `/mag/query` | Returns **`text/event-stream`**. Read SSE **`data:`** lines as JSON events. Same **ownership** and **`user_id` merge** as non-streaming. |

**Client tips:** use `EventSource` only for GET; for POST+SSE use **`fetch` + `ReadableStream`** or Axios with `responseType: 'stream'` in Node. Handle **202** from upstream if memory is still ingesting (`MAG_NOT_READY`).

---

## 7. All proxy routes (Node → FastAPI)

Unless noted, responses follow FastAPI **`APIResponse`**: `{ success, data?, error?, metadata? }`. Errors may use **`detail`** (FastAPI) or **`success: false`** (Node-only routes).

| Method | Path | Purpose | Auth / ownership notes |
|--------|------|---------|---------------------------|
| **POST** | `/route` | NL query routing (`query`, `pdf_uploaded`) | No file ownership. |
| **POST** | `/upload` | Multipart: `file`, optional `user_id`, `metadata` | Cookie user id preferred. Persists **`UserUpload`** in Mongo on success. |
| **GET** | `/user-uploads` | List user’s PDFs (`file_id`, `filename`, `memory_id`, counts…) | Strict cookie if `ACCESS_TOKEN_JWT_SECRET` set; else `?user_id=`. |
| **GET** | `/status/:file_id` | PDF + chatbot + **MAG** processing status | **403** if cookie user and file not in `UserUpload`. |
| **GET** | `/pages/:file_id` | Pages with tables (extractor UI) | **403** same as above. |
| **GET** | `/pages/:file_id/:page_index/preview` | Page preview image (blob) | **403** same; success returns binary. |
| **GET** | `/pages/:file_id/preview-by-page/:page_number` | Preview by **1-based PDF page number** (blob) | **403** same. |
| **POST** | `/extract` | `{ file_id, page_indices }` | **403** if not owner. |
| **POST** | `/analyze` | Table narration (JSON) | No file-id gate on proxy. |
| **GET** | `/edgar/:ticker` | SEC EDGAR proxy | Query string forwarded. |
| **GET** | `/documents` | FastAPI documents listing | Query forwarded. |
| **GET** | `/filters` | FastAPI filters | Query forwarded. |
| **DELETE** | `/files/:file_id` | Remove upload from FastAPI + **UserUpload** row | **403** if not owner. |
| **GET** | `/mag/memories` | List MAG memories | **`user_id` from JWT** when set. |
| **POST** | `/mag/query` | MAG chat (JSON response) | **`user_id` merge** + **`file_id` ownership** when applicable. |
| **POST** | `/mag/query/stream` | MAG chat (SSE) | Same as `/mag/query`. |

**403 body (proxy):** `{ success: false, detail: { code: "FILE_ACCESS_DENIED", message: "..." } }`.

---

## 8. Environment variables the client does not set (ops)

| Variable | Role |
|----------|------|
| `FASTAPI_URL` | Upstream agentic-router base URL. |
| `FASTAPI_API_KEY` | Sent as `X-API-Key` to FastAPI (must match FastAPI `API_KEY`). |
| `MONGODB_URI` | Node Mongo for **`UserUpload`** index. |
| `ACCESS_TOKEN_JWT_SECRET` | Verifies `access_token` cookie; enables strict **`/user-uploads`**. |
| `JWT_SECRET` | Fallback verify secret if `ACCESS_TOKEN_JWT_SECRET` unset. |
| `ANONYMOUS_USER_ID` | Fallback `user_id` on upload when no cookie/body. |

FastAPI additionally uses **`MONGODB_URI`** (and related env) for **MAG memory** and **parse snapshots** — see `agentic-router/config/env.example`.

---

## 9. Quick checklist before go-live

- [ ] UI uses **`credentials: 'include'`** / **`withCredentials: true`** toward the proxy origin.
- [ ] Proxy **`ACCESS_TOKEN_JWT_SECRET`** matches auth service JWT signing secret (HS256).
- [ ] **`GET /user-uploads`** drives the document picker; only **`file_id`s** from there are used for **`/status`**, **`/pages`**, **`/extract`**, **`/mag/*`** when JWT is on.
- [ ] Poll **`/status/:file_id`** until **MAG / chatbot** flags indicate readiness before **`/mag/query`**.

---

## 10. Where to read FastAPI schemas

Open **`agentic-router`** **`/docs`** (Swagger) on the FastAPI host for exact request/response models (`UploadResponse`, `MAGQueryRequest`, `ExtractRequest`, etc.). The proxy **forwards** bodies and responses transparently except where noted above.
