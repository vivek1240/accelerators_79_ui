# MVP Demo Backend

Node.js backend for the MVP demo UI: handles auth (signup, login, admin) and proxies app requests to the deployed FastAPI (agentic router) with an API key.

## Setup

1. Copy env and set values:
   ```bash
   cp .env.example .env
   ```
   Edit `.env`: set `MONGODB_URI`, `JWT_SECRET`, `FASTAPI_URL` (deployed Python API base), and `FASTAPI_API_KEY` (same as `API_KEY` on the FastAPI server).

2. Install and run:
   ```bash
   npm install
   npm run dev
   ```
   Server runs on `PORT` (default 4000).

## Routes

- **Auth:** `POST /auth/signup`, `POST /auth/login`, `GET /auth/users` (admin), `PATCH /auth/users/:user_id/access` (admin).
- **Proxy to FastAPI (require JWT + is_allowed):** `/route`, `/upload`, `/status/:file_id`, `/pages/:file_id`, `/pages/:file_id/:page_index/preview`, `/extract`, `/query`, `/edgar/:ticker`, `/documents`, `/filters`, `DELETE /files/:file_id`.
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
