# MVP Demo Backend

Node.js backend for the MVP demo UI: handles auth (signup, login, admin) and proxies app requests to the deployed FastAPI (agentic router) with an API key.

**Client integration:** see [integration.md](./integration.md) for all proxy endpoints, JWT cookies, MAG chatbot, and recommended flows.

## Setup

1. Copy env and set values:
   ```bash
   cp .env.example .env
   ```
   Edit `.env`: set `MONGODB_URI`, `JWT_SECRET`, `FASTAPI_URL` (deployed Python API base), and `FASTAPI_API_KEY` (same as `API_KEY` on the FastAPI server). For Google OAuth cookie integration, set `ACCESS_TOKEN_JWT_SECRET` to the same HS256 secret the auth service uses to sign `access_token` (see `.env.example`).

2. Install and run:
   ```bash
   npm install
   npm run dev
   ```
   Server runs on `PORT` (default 4000).

3. Smoke test (needs MongoDB on `MONGODB_URI`, no FastAPI):
   ```bash
   npm run smoke
   ```

## Routes

- **Auth:** `POST /auth/signup`, `POST /auth/login`, `GET /auth/users` (admin), `PATCH /auth/users/:user_id/access` (admin).
- **Proxy to FastAPI:** `/route`, `/upload`, `/status/:file_id`, `/pages/:file_id`, `/pages/:file_id/:page_index/preview`, `/extract`, `/query`, `/edgar/:ticker`, `/documents`, `/filters`, `DELETE /files/:file_id`, `/mag/*`.
- **User uploads index (Mongo):** `GET /user-uploads` — lists `file_id` / filename / `memory_id` for the user. Optional `?user_id=` when `ACCESS_TOKEN_JWT_SECRET` is unset (dev). When `ACCESS_TOKEN_JWT_SECRET` is set, requires HttpOnly `access_token` cookie. Successful `/upload` records rows here; `DELETE /files/:file_id` removes the row when possible.
- **Cookie JWT (optional):** If `ACCESS_TOKEN_JWT_SECRET` or `JWT_SECRET` is set, the proxy verifies `access_token` and `/upload` forwards `user_id` from the token’s `sub` / `user_id` / `id` claim when valid (overrides body).
- **File access:** When a valid cookie user is present, `/status`, `/pages`, previews, `/extract`, `DELETE /files/:id` require that `file_id` to exist in `UserUpload` for that user (403 otherwise). `POST /mag/query` and `/mag/query/stream` inject `user_id` from the cookie and enforce the same if `file_id` is in the body. Set `PROXY_SKIP_FILE_OWNERSHIP=true` to disable checks (emergency only).
- **Health:** `GET /health`.

## Running with the MVP demo UI

1. Start this backend: `npm run dev` (port 4000).
2. In `mvp_demo_ui`, set the proxy to the Node backend so the UI talks to this server instead of FastAPI directly:
   ```bash
   VITE_API_PROXY_TARGET=http://localhost:4000 npm run dev
   ```
3. Open the UI; sign up / log in. Use the Admin tab (after promoting a user to admin in the DB) to allow/deny access.

## First admin

Set one user as admin in MongoDB (e.g. in Compass set `role: "admin"` and `is_allowed: true` for that user), or add a small script to do it by email.
