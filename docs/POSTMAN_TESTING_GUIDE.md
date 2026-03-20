# FocusForest — Postman AI Testing Guide

> Paste this entire file into Antigravity and say:
> "Read this guide and build me a complete Postman collection for FocusForest"

---

## What to Ask Antigravity

### Prompt to generate the Postman collection

```
Read AGENTS.md and this testing guide.

Create a complete Postman collection JSON file for the FocusForest backend.
Save it as docs/FocusForest.postman_collection.json

Requirements:
- Collection name: FocusForest Backend
- Base URL variable: {{baseUrl}} = http://localhost:3000
- Auth token variable: {{jwt}} — auto-set by signup/login tests
- All requests grouped into folders by feature
- Every request has example responses documented
- Tests written in Postman's test syntax (pm.test) for every request
- Requests run in order within each folder

Folders and requests listed below.
```

---

## ⚠️ Pre-Run Checklist (Read Before Every Test Run)

### 1. Fix `.env` — DIRECT_URL line is broken

Open `.env` and make sure `DIRECT_URL` ends with `/postgres` on its own line with **nothing** after it.
If the comment `# Supabase — Auth & Admin` is glued onto the same line as the URL, Prisma
cannot parse the connection string and you will get:
```
Can't reach database server at aws-1-ap-southeast-2.pooler.supabase.com:6543
```
**Correct `.env` format:**
```
DIRECT_URL=postgresql://...supabase.com:5432/postgres

# Supabase — Auth & Admin
```
Restart `npm run dev` after fixing.

### 2. Re-running tests — signup email already exists

The signup request uses the fixed email `test@focusforest.com`. On the **first run** it returns
`201 Created`. On **every subsequent run** Supabase Auth already has that user and returns
`409 EMAIL_TAKEN` — which means `{{jwt}}` never gets set, and every downstream request fails.

**Solutions (pick one):**

| Option | How |
|--------|-----|
| **A — Skip signup, run login directly** | Start the Collection Runner from the **Login** request (not Signup). Login always returns a fresh jwt. |
| **B — Delete test user between runs** | Go to [Supabase Dashboard → Authentication → Users](https://supabase.com/dashboard), find `test@focusforest.com`, delete it, then re-run. |
| **C — Use a unique email each run** | Change the signup email to something like `test+{{$timestamp}}@focusforest.com` in Postman. Note: you will need to update the login email to match. |

> **Recommended for quick iteration:** Option A. Just run **Login first** — it sets `{{jwt}}` and everything else follows normally.

---

## Collection Structure

### Folder 1 — Health Check
| # | Method | Endpoint | Auth |
|---|--------|----------|------|
| 1 | GET | `{{baseUrl}}/health` | None |

**Tests:**
- Status 200
- Response has `{ status: "ok" }`

---

### Folder 2 — Auth
| # | Method | Endpoint | Auth |
|---|--------|----------|------|
| 1 | POST | `{{baseUrl}}/api/v1/auth/signup` | None |
| 2 | POST | `{{baseUrl}}/api/v1/auth/login` | None |
| 3 | GET | `{{baseUrl}}/api/v1/auth/me` | Bearer `{{jwt}}` |
| 4 | POST | `{{baseUrl}}/api/v1/auth/logout` | Bearer `{{jwt}}` |

**Request bodies:**

Signup:
```json
{
  "email": "test@focusforest.com",
  "password": "Test1234!",
  "name": "Test User",
  "utcOffset": 330
}
```

Login:
```json
{
  "email": "test@focusforest.com",
  "password": "Test1234!"
}
```

**Tests for signup:**
- Status **201** (first run) OR **409** (re-run — user already exists, this is OK)
- If 201: response contains `accessToken`, auto-save to `{{jwt}}`
- If 409: skip silently — run the Login request next to get `{{jwt}}`

**Tests for login:**
- Status 200
- Response contains `accessToken`
- Auto-save token: `pm.collectionVariables.set("jwt", pm.response.json().accessToken)`
- Auto-save userId: `pm.collectionVariables.set("userId", pm.response.json().user.id)`

**Tests for /auth/me:**
- Status 200
- Response has `id`, `email`, `name`, `utcOffset`
- `utcOffset` equals 330

**Tests for logout:**
- Status 200

---

### Folder 3 — Sessions
| # | Method | Endpoint | Auth |
|---|--------|----------|------|
| 1 | POST | `{{baseUrl}}/api/v1/sessions` | Bearer `{{jwt}}` |
| 2 | POST | `{{baseUrl}}/api/v1/sessions` (dedup test) | Bearer `{{jwt}}` |
| 3 | POST | `{{baseUrl}}/api/v1/sessions` (no task) | Bearer `{{jwt}}` |
| 4 | POST | `{{baseUrl}}/api/v1/sessions` (sprint variant) | Bearer `{{jwt}}` |
| 5 | GET | `{{baseUrl}}/api/v1/sessions` | Bearer `{{jwt}}` |

**Request bodies:**

Session 1 — Classic, task completed:
```json
{
  "variant": "classic",
  "focusMinutes": 25,
  "taskText": "Finish Chapter 4",
  "taskStatus": "completed",
  "clientSessionId": "11111111-1111-1111-1111-111111111111"
}
```

Session 2 — Same clientSessionId (dedup test):
```json
{
  "variant": "classic",
  "focusMinutes": 25,
  "taskText": "Finish Chapter 4",
  "taskStatus": "completed",
  "clientSessionId": "11111111-1111-1111-1111-111111111111"
}
```

Session 3 — Classic, no task:
```json
{
  "variant": "classic",
  "focusMinutes": 25,
  "taskText": null,
  "taskStatus": "none",
  "clientSessionId": "22222222-2222-2222-2222-222222222222"
}
```

Session 4 — Sprint variant:
```json
{
  "variant": "sprint",
  "focusMinutes": 15,
  "taskText": "Quick review",
  "taskStatus": "carried",
  "clientSessionId": "33333333-3333-3333-3333-333333333333"
}
```

**Tests for Session 1:**
- Status 200
- `tree.stageProgress` equals 1.5 (25/25 × 1.5)
- `tree.glowLevel` equals 4
- `tree.stage` equals 1
- `tree.totalSessions` equals 1

**Tests for Session 2 (dedup):**
- Status 409
- Error code is `DUPLICATE_SESSION`
- `tree.stage` is NOT incremented

**Tests for Session 3 (no task):**
- Status 200
- `tree.stageProgress` equals 2.5 (cumulative)
- `tree.glowLevel` is less than 4 (mixed tasks)

**Tests for Session 4 (sprint):**
- Status 200
- `tree.stageProgress` equals 3.1 (sprint = 15/25 × 1.0 = 0.6, cumulative 2.5 + 0.6 = 3.1)

**Tests for GET /sessions:**
- Status 200
- Response has `sessions` array
- Array length is 3 (dedup one was rejected)

---

### Folder 4 — Trees & Calendar
| # | Method | Endpoint | Auth |
|---|--------|----------|------|
| 1 | GET | `{{baseUrl}}/api/v1/trees/today` | Bearer `{{jwt}}` |
| 2 | GET | `{{baseUrl}}/api/v1/trees/calendar?month=3&year=2026` | Bearer `{{jwt}}` |
| 3 | GET | `{{baseUrl}}/api/v1/trees/week/2026-W12` | Bearer `{{jwt}}` |

**Tests for /trees/today:**
- Status 200
- Has `date`, `stage`, `glowLevel`, `totalSessions`
- `isBare` is false
- `finalisedAt` is null (day not over yet)

**Tests for /trees/calendar:**
- Status 200
- Has `trees` array
- Each tree has `date`, `stage`, `glowLevel`

**Tests for /trees/week:**
- Status 200
- Has 7 day slots (Mon–Sun)
- Has `complete` boolean flag

---

### Folder 5 — Groups
| # | Method | Endpoint | Auth |
|---|--------|----------|------|
| 1 | POST | `{{baseUrl}}/api/v1/groups` | Bearer `{{jwt}}` |
| 2 | GET | `{{baseUrl}}/api/v1/groups/{{groupId}}` | Bearer `{{jwt}}` |
| 3 | GET | `{{baseUrl}}/api/v1/groups/{{groupId}}/calendar?month=3&year=2026` | Bearer `{{jwt}}` |
| 4 | POST | `{{baseUrl}}/api/v1/groups/join` (own group = 409) | Bearer `{{jwt}}` |
| 5 | DELETE | `{{baseUrl}}/api/v1/groups/{{groupId}}/members/{{userId}}` | Bearer `{{jwt}}` |

**Request bodies:**

Create group:
```json
{
  "name": "Study Squad"
}
```

Join group (use invite code from create response):
```json
{
  "inviteCode": "{{inviteCode}}"
}
```

**Tests for POST /groups:**
- Status 201
- Has `id`, `name`, `inviteCode`, `memberCount`
- `memberCount` equals 1
- `inviteCode` is 6 characters
- Auto-save: `pm.collectionVariables.set("groupId", pm.response.json().id)`
- Auto-save: `pm.collectionVariables.set("inviteCode", pm.response.json().inviteCode)`

**Tests for GET /groups/:id:**
- Status 200
- Has `members` array
- `members` length equals 1
- Has `forestStats.totalCompletedTrees`

**Tests for GET /groups/:id/calendar:**
- Status 200
- Has `days` array

**Tests for join own group:**
- Status 409
- Error code is `ALREADY_MEMBER`

**Tests for DELETE (leave group):**
- Status 200
- Has success message

---

### Folder 6 — Edge Cases & Error Handling
| # | Method | Endpoint | Expected |
|---|--------|----------|----------|
| 1 | GET | `{{baseUrl}}/api/v1/auth/me` (no token) | 401 UNAUTHORIZED |
| 2 | POST | `{{baseUrl}}/api/v1/sessions` (invalid variant) | 400 VALIDATION_ERROR |
| 3 | POST | `{{baseUrl}}/api/v1/sessions` (missing fields) | 400 VALIDATION_ERROR |
| 4 | GET | `{{baseUrl}}/api/v1/groups/nonexistent-id` | 404 NOT_FOUND |
| 5 | POST | `{{baseUrl}}/api/v1/groups/join` (wrong code) | 404 NOT_FOUND |

**Request bodies:**

Invalid variant:
```json
{
  "variant": "invalid_variant",
  "focusMinutes": 25,
  "taskText": null,
  "taskStatus": "none",
  "clientSessionId": "44444444-4444-4444-4444-444444444444"
}
```

Missing fields:
```json
{
  "variant": "classic"
}
```

Wrong invite code:
```json
{
  "inviteCode": "000000"
}
```

**Tests for all edge cases:**
- Correct HTTP status code
- Response has `error.code` field
- Response has `error.message` field
- Error envelope matches `{ error: { code, message } }` format

---

### Folder 7 — Dev Tools
| # | Method | Endpoint | Auth |
|---|--------|----------|------|
| 1 | POST | `{{baseUrl}}/dev/midnight-reset` | None |

**Tests:**
- Status 200
- Response has `ok: true`
- Response has `message`

---

## Collection Variables

| Variable | Initial Value | Description |
|----------|--------------|-------------|
| `baseUrl` | `http://localhost:3000` | API base URL |
| `jwt` | *(auto-set by login)* | Bearer token |
| `groupId` | *(auto-set by create group)* | Test group ID |
| `inviteCode` | *(auto-set by create group)* | Group invite code |
| `userId` | *(auto-set by signup)* | Test user ID |

---

## Score Engine Verification Cheatsheet

Use these to verify your formula is correct in Postman tests:

| Variant | Minutes | Task Status | Expected stageProgress |
|---------|---------|-------------|----------------------|
| classic | 25 | completed | 1.5 |
| classic | 25 | none | 1.0 |
| classic | 25 | carried | 1.0 |
| sprint | 15 | completed | 0.9 |
| sprint | 15 | none | 0.6 |
| deep_work | 50 | completed | 3.0 |
| deep_work | 50 | none | 2.0 |
| flow | 90 | completed | 5.4 |
| flow | 90 | none | 3.6 |

Formula: `stageProgress = (focusMinutes / 25) × taskMultiplier`
Multipliers: `completed = 1.5` | `none = 1.0` | `carried = 1.0`

---

## How to Run in Postman

1. Import `FocusForest.postman_collection.json` into Postman
2. Click **Run collection** (the runner button)
3. Make sure your server is running (`npm run dev`)
4. Run folders in order: Health → Auth → Sessions → Trees → Groups → Edge Cases → Dev
5. Auth folder must run first — it sets the `{{jwt}}` variable automatically
6. Groups folder must run after Sessions — it needs tree data to exist

---

## What Each Test Folder Proves

| Folder | What it proves |
|--------|---------------|
| Health | Server is up and responding |
| Auth | Signup, login, JWT flow, profile endpoint |
| Sessions | Score engine formula is correct, dedup works, all variants work |
| Trees | Calendar data persists correctly, today's tree reflects sessions |
| Groups | Create, join, leave, member guard (403 for non-members) |
| Edge Cases | Error envelope is consistent, validation works, 401 on missing auth |
| Dev | Midnight cron can be triggered and completes without error |

---

## Known Issues & Fixes

### DB unreachable: `Can't reach database server at ...pooler.supabase.com:6543`

**Root cause:** The `DIRECT_URL` value in `.env` had a missing newline — the comment
`# Supabase — Auth & Admin` was appended directly to the URL, making it unparseable.
Prisma uses `DIRECT_URL` for migrations and can fall back to it; if it is invalid the
connection string parser may reject the whole configuration.

**Fix:** Ensure `.env` line 21 is only the URL, nothing else on that line. See Pre-Run Checklist above.

### Signup returns 409 on re-runs

**Root cause:** `test@focusforest.com` is a fixed email. Supabase Auth keeps users
persisted; it will always reject a duplicate signup. The Postman test collection
previously required status 201 strictly, so it failed on any re-run.

**Fix applied in collection:** Signup test now accepts `201 OR 409` — if 409, it
logsane a warning and no collection variables are changed. The Login request (run next)
will set `{{jwt}}` correctly regardless.
