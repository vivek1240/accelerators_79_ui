# MAG Integration Debug Guide (Client-Side)

This guide is for frontend/client integration teams using the proxy + MAG flow.
It is written to be executed directly (or with Claude Code) to resolve the two observed issues quickly:

1. `400 Unsupported parameter: max_tokens ...` on `o3-mini`
2. `context is missing` / empty-memory behavior despite successful upload

---

## Backend Status (Already Fixed on Our Side)

The backend/proxy has been updated and verified for:

- `o3-mini` requests now use `max_completion_tokens` (not `max_tokens`)
- `POST /mag/query` and `POST /mag/query/stream` now return explicit `202 MAG_NOT_READY` when memory is not ready
- proxy now preserves upstream status code from `/mag/query` (so `202` reaches client correctly)
- Bearer JWT support is enabled in proxy JWT middleware

If you still see issues, they are most likely integration-flow timing/auth payload issues on the client side.

---

## Required Endpoints (Use These in This Order)

1. `POST /upload`  
2. `GET /user-uploads` (optional but recommended for file picker/source of truth)  
3. `GET /status/:file_id` (poll until ready)  
4. `POST /mag/query` or `POST /mag/query/stream`

Do **not** call `/mag/query` immediately after upload without status polling.

---

## Critical JWT/Auth Requirements (Client-Side Fix)

Your upload and MAG query must be made under the **same authenticated user context**.

- Always send `Authorization: Bearer <token>` consistently across:
  - `/upload`
  - `/status/:file_id`
  - `/mag/query`
  - `/mag/query/stream`
- Ensure the JWT contains a stable user claim (`sub` preferred; `user_id`/`id` fallback).
- Do not mix tokens from different sessions/users between upload and query.

If this is violated, `file_id -> user_id -> memory_id` scoping can fail and MAG returns missing-context behavior.

---

## Client Logic You Must Implement

### 1) Upload

- Call `POST /upload` with multipart file.
- Save:
  - `data.file_id`
  - `data.memory_id` (if returned)
  - `data.mag_status`

### 2) Poll status before query

Poll `GET /status/:file_id` every 2-5 seconds (max wait window based on file size).

Proceed to MAG only when:

- `mag_ready === true` OR `chatbot_ready === true`
- and `mag_processing === false` (preferred)

### 3) Query with retry behavior

If `POST /mag/query` returns:

- `202` with `code: MAG_NOT_READY` -> retry with exponential backoff (2s, 4s, 8s, ...)
- `400` with `code: MAG_MEMORY_SCOPE_MISSING` -> payload/auth scoping bug on client
- `403 FILE_ACCESS_DENIED` -> wrong `file_id` for current user/token

---

## Known Error Mapping

### A) `400 Unsupported parameter: max_tokens ...`

Meaning:
- Client is likely hitting an older deployment path OR stale service instance.

Action:
- Confirm service revision has latest backend patch.
- Re-test with same payload after restart/deploy.

### B) `I’m unable to provide ... context is missing`

Meaning:
- Query executed before memory was ready, or scoped memory wasn’t resolved for that user/file.

Action:
- Enforce status polling gate.
- Verify same Bearer token is used across upload + query.
- Verify `file_id` is from latest upload response (or `/user-uploads`) for that user.

---

## Copy-Paste cURL Validation Script

> Replace `BASE_URL` and credentials.  
> This script validates the exact flow end-to-end from client perspective.

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://<your-proxy-domain>}"
EMAIL="${EMAIL:-client-debug@example.com}"
PASSWORD="${PASSWORD:-password123}"
PDF_PATH="${PDF_PATH:-./sample.pdf}"

echo "1) Login..."
LOGIN_JSON=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$LOGIN_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
echo "   token acquired"

echo "2) Upload..."
UPLOAD_JSON=$(curl -sS -X POST "$BASE_URL/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$PDF_PATH")
echo "$UPLOAD_JSON"
FILE_ID=$(echo "$UPLOAD_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["file_id"])')
echo "   file_id=$FILE_ID"

echo "3) Poll status..."
for i in {1..40}; do
  STATUS_JSON=$(curl -sS -X GET "$BASE_URL/status/$FILE_ID" \
    -H "Authorization: Bearer $TOKEN")
  echo "poll[$i]: $STATUS_JSON"
  READY=$(echo "$STATUS_JSON" | python3 - <<'PY'
import sys, json
obj=json.load(sys.stdin)
d=obj.get("data",{})
print("1" if (d.get("mag_ready") or d.get("chatbot_ready")) else "0")
PY
)
  if [[ "$READY" == "1" ]]; then
    break
  fi
  sleep 3
done

echo "4) MAG query..."
QUERY_BODY=$(cat <<EOF
{"question":"What's the company's main product?","file_id":"$FILE_ID","session_id":"client-debug","deep_thinking":true}
EOF
)

HTTP_CODE=$(curl -sS -o /tmp/mag_query_resp.json -w "%{http_code}" \
  -X POST "$BASE_URL/mag/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$QUERY_BODY")

echo "HTTP $HTTP_CODE"
cat /tmp/mag_query_resp.json
```

---

## Frontend Pseudocode (Retry-Safe)

```ts
async function askMag(fileId: string, question: string, token: string) {
  await waitUntilReady(fileId, token); // polls /status/:file_id

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`/mag/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question,
        file_id: fileId,
        session_id: "web-session-1",
        deep_thinking: true,
      }),
    });

    if (res.status === 202) {
      await sleep(2 ** attempt * 1000);
      continue;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`MAG query failed: ${res.status} ${JSON.stringify(err)}`);
    }

    return res.json();
  }

  throw new Error("MAG not ready after retries");
}
```

---

## What Logs to Share If It Still Fails

Please send one full failing chain (token redacted):

1. `POST /upload` request + response
2. `GET /status/:file_id` response right before query
3. `POST /mag/query` request body + response status/body
4. Whether same token was used across all three calls

This is enough to isolate auth-scoping vs readiness vs deployment mismatch within minutes.

---

## Claude Code Prompt (Copy-Paste)

Use this exact prompt in Claude Code against your frontend repo:

```text
I need you to fix MAG integration reliability with our proxy backend.

Implement these requirements:
1) Upload flow stores file_id from POST /upload response.
2) Before calling /mag/query, poll GET /status/:file_id until mag_ready || chatbot_ready.
3) If /mag/query returns 202 with code MAG_NOT_READY, retry with exponential backoff.
4) Ensure the same Bearer token is sent for /upload, /status/:file_id, and /mag/query.
5) Add structured debug logs (request id, file_id, status code, error code) without logging raw JWT.
6) Show user-friendly UI states: "Uploading", "Processing", "Ready", "Retrying", "Failed".
7) Add a small integration test/mocked test for: upload -> not-ready -> retry -> success path.

Then output:
- files changed
- exact retry logic
- how to test manually with one PDF
```

---

## Final Checklist

- [ ] Using same Bearer token across upload/status/query
- [ ] Query called only after readiness gate
- [ ] `202 MAG_NOT_READY` handled with retry
- [ ] `file_id` sourced from latest upload/user file list
- [ ] No stale deployment serving old MAG code

