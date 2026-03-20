# FocusForest Backend — Session Summary

**Last updated:** 2026-03-21  
**Starting point:** Empty folder with just CLAUDE.md and docs/PRD.md

---

## What Was Built

### 📁 AI IDE Context Files

| File | Purpose |
|------|---------|
| [prisma/schema.prisma](file:///d:/SEM%206/HCI/FocusForest/prisma/schema.prisma) | Full DB schema — all 7 tables with relations, indexes, enums |
| [docs/API.md](file:///d:/SEM%206/HCI/FocusForest/docs/API.md) | Every endpoint with exact Zod schemas + request/response shapes |
| [docs/ERRORS.md](file:///d:/SEM%206/HCI/FocusForest/docs/ERRORS.md) | Standard `{ error: { code, message, details } }` envelope + helper code |
| [docs/DECISIONS.md](file:///d:/SEM%206/HCI/FocusForest/docs/DECISIONS.md) | 8 ADRs — why httpOnly cookies, server-side score engine, Redis leaderboard, etc. |

---

### 🗄️ Database
- Supabase project live (Sydney, `ap-southeast-2`)
- Prisma migration applied — all 7 tables in Supabase:
  `users`, `sessions`, `daily_trees`, `streaks`, `groups`, `group_members`, `push_subscriptions`

---

### 🏗️ Project Foundation

| File | Purpose |
|------|---------|
| [package.json](file:///d:/SEM%206/HCI/FocusForest/package.json) | `npm run dev / build / start` scripts |
| [tsconfig.json](file:///d:/SEM%206/HCI/FocusForest/tsconfig.json) | Strict TypeScript, Node 20, commonjs output |
| [src/index.ts](file:///d:/SEM%206/HCI/FocusForest/src/index.ts) | Express app — CORS, cookies, router mounts, `/health`, cron startup |
| [src/lib/prisma.ts](file:///d:/SEM%206/HCI/FocusForest/src/lib/prisma.ts) | Prisma client singleton (hot-reload safe) |
| [src/lib/supabase.ts](file:///d:/SEM%206/HCI/FocusForest/src/lib/supabase.ts) | `supabaseAdmin` (service role) + `supabaseAnon` (for auth) |
| [src/lib/apiError.ts](file:///d:/SEM%206/HCI/FocusForest/src/lib/apiError.ts) | Standard error envelope helper |
| [src/middleware/auth.ts](file:///d:/SEM%206/HCI/FocusForest/src/middleware/auth.ts) | JWT verification via `supabaseAdmin.auth.getUser()` |
| [src/middleware/validate.ts](file:///d:/SEM%206/HCI/FocusForest/src/middleware/validate.ts) | Zod validation middleware with field-level errors |

---

### 🔐 Auth Routes — `POST/GET /api/v1/auth/*`

| Route | What it does |
|-------|-------------|
| `POST /auth/signup` | Creates Supabase Auth user + inserts `public.users` row + returns JWT |
| `POST /auth/login` | Proxies `signInWithPassword`, sets httpOnly cookies + returns JWT |
| `POST /auth/logout` | Clears auth cookies |
| `GET /auth/me` | Returns `{ id, email, name, avatarUrl, utcOffset, createdAt }` |

---

### 🌱 Session Engine — `POST/GET /api/v1/sessions/*`

| File | What it does |
|------|-------------|
| [src/services/scoreEngine.ts](file:///d:/SEM%206/HCI/FocusForest/src/services/scoreEngine.ts) | Server-side formula: `stageProgress = (focusMinutes / 25) × taskMultiplier` |
| [src/services/treeService.ts](file:///d:/SEM%206/HCI/FocusForest/src/services/treeService.ts) | Upserts `daily_trees` per user's local date, computes stage (0–4) + glow (0–4) |
| [src/routes/sessions.ts](file:///d:/SEM%206/HCI/FocusForest/src/routes/sessions.ts) | `POST /sessions` — auth → dedup → score → DB write → tree upsert → response |
| | `GET /sessions` — paginated history with date range filter |

**Verified output for 25min Classic session with completed task:**
```json
{ "tree": { "stage": 1, "glowLevel": 4, "stageProgress": 1.5, "totalSessions": 1 }, "streak": { "currentStreak": 0 } }
```

---

### 🌳 Tree & Calendar Routes — `GET /api/v1/trees/*`

| Route | What it does |
|-------|-------------|
| `GET /trees/today` | Live tree state using user's `utcOffset` for local date |
| `GET /trees/calendar` | All daily trees, filterable by `?month=&year=` |
| `GET /trees/week/2026-W12` | Full 7-day ISO week grid with `complete` flag |

---

### 👥 Groups API — `POST/GET/DELETE /api/v1/groups/*`

| Route | What it does |
|-------|-------------|
| `POST /groups` | Creates group + adds creator as admin; generates unique 6-char invite code; 201 |
| `POST /groups/join` | Joins via invite code; enforces max-5 cap; 404/409/403 guards; 200 |
| `GET /groups/:id` | Returns group details + member list (with streak) + forest stats (completed trees count); 403 for non-members |
| `GET /groups/:id/calendar` | Per-member daily trees pivoted by date; optional `?month=&year=` filter; 403 for non-members |
| `DELETE /groups/:id/members/:userId` | Self-leave (always) or admin-remove (403 for others); decrements memberCount atomically |

**Files:**
- [src/services/groupService.ts](file:///d:/SEM%206/HCI/FocusForest/src/services/groupService.ts) — 6 service functions: `generateInviteCode`, `createGroup`, `joinGroup`, `getGroupDetails`, `getGroupCalendar`, `removeMember`
- [src/routes/groups.ts](file:///d:/SEM%206/HCI/FocusForest/src/routes/groups.ts) — 5 route handlers (Zod-validated, thin)

**Verified output for `POST /groups`:**
```json
{"id":"e77791d1-6765-4775-917b-eb5ab769b714","name":"Study Squad","inviteCode":"66WWXC","memberCount":1,"createdAt":"2026-03-19T23:57:19.638Z"}
```

---

### ⏰ Midnight Cron — Timezone-Aware Daily Reset

Fires every hour (`0 * * * *`). Processes users whose local time is currently 00:00 based on `utc_offset`.

| File | What it does |
|------|-------------|
| [src/services/streakService.ts](file:///d:/SEM%206/HCI/FocusForest/src/services/streakService.ts) | `upsertStreak()` — increments/resets streak; `resetStreak()` — zeroes on missed day |
| [src/jobs/midnightReset.ts](file:///d:/SEM%206/HCI/FocusForest/src/jobs/midnightReset.ts) | `startMidnightCron()` + `runMidnightReset()` — full hourly pipeline |

**Per-user pipeline at midnight:**
1. Finalise yesterday's `daily_trees` — lock `stage`, set `is_bare` if 0 sessions, set `finalised_at`
2. Update streak — increment if consecutive day, reset to 0 if bare (idempotent)
3. Seed today's `daily_trees` row — skips if user already had a session (idempotent)
4. Weekly forest check — if Sunday and all 7 days had sessions, logs completion (hook for push/archive)

**Dev trigger route** (disabled in production):
```
POST /dev/midnight-reset   →  runs runMidnightReset() immediately
```

---

### 🧪 Postman Testing Suite

| File | Purpose |
|------|---------|
| [docs/POSTMAN_TESTING_GUIDE.md](file:///d:/SEM%206/HCI/FocusForest/docs/POSTMAN_TESTING_GUIDE.md) | AI-generated testing guide — all folders, request bodies, test scripts, error cases, and pre-run checklist |
| [docs/FocusForest.postman_collection.json](file:///d:/SEM%206/HCI/FocusForest/docs/FocusForest.postman_collection.json) | Importable Postman collection — 24 requests, `pm.test()` assertions, auto-saves `jwt`/`userId`/`groupId`/`inviteCode` |
| [docs/FocusForest Backend.postman_test_run.json](file:///d:/SEM%206/HCI/FocusForest/docs/FocusForest%20Backend.postman_test_run.json) | Test run 1 results |
| [docs/FocusForest Backend.postman_test_run2.json](file:///d:/SEM%206/HCI/FocusForest/docs/FocusForest%20Backend.postman_test_run2.json) | Test run 2 results — **86 pass / 3 fail** (before timezone fix) |

**Collection structure:**
```
1 — Health Check       GET  /health
2 — Auth               Signup · Login · Me · Logout
3 — Sessions           4× POST (classic/sprint/dedup/no-task) · 2× GET (list + date filter)
4 — Trees & Calendar   today · calendar · week/:weekId
5 — Groups             Create · Details · Calendar · Join (409) · Leave
6 — Edge Cases         401 no-token · 400 bad variant · 400 missing fields · 404 group · 404 invite code
7 — Dev Tools          POST /dev/midnight-reset
```

**Re-run safety:** Signup accepts `201` (first run) or `409` (re-run, user exists — Login sets `{{jwt}}` instead).

---

```
GET    /health                                    no auth
POST   /api/v1/auth/signup                        no auth
POST   /api/v1/auth/login                         no auth
POST   /api/v1/auth/logout                        Bearer JWT
GET    /api/v1/auth/me                            Bearer JWT
POST   /api/v1/sessions                           Bearer JWT
GET    /api/v1/sessions                           Bearer JWT
GET    /api/v1/trees/today                        Bearer JWT
GET    /api/v1/trees/calendar                     Bearer JWT
GET    /api/v1/trees/week/:weekId                 Bearer JWT
POST   /api/v1/groups                             Bearer JWT
POST   /api/v1/groups/join                        Bearer JWT
GET    /api/v1/groups/:id                         Bearer JWT
GET    /api/v1/groups/:id/calendar                Bearer JWT
DELETE /api/v1/groups/:id/members/:userId         Bearer JWT
POST   /dev/midnight-reset                        no auth (dev only)
```

---

## Bugs Fixed This Session

| Bug | File | Root Cause | Fix |
|-----|------|-----------|-----|
| `DIRECT_URL` malformed in `.env` | `.env` | Comment `# Supabase — Auth & Admin` was appended directly to the URL (no newline), making the connection string unparseable → `Can't reach database server` on startup | Added newline between URL and comment |
| `stageProgress` never accumulated (sessions 2+) | `treeService.ts` | Aggregate `WHERE createdAt >= todayDate` used UTC midnight of the user's local date. For IST users (UTC+5:30), sessions created at ~19:35 UTC fall **before** that boundary → sum = 0 each time | Changed window to `localDayStartUtc = todayDate − utcOffset`, which correctly maps to the user's real local midnight in UTC |
| Postman collection failed on re-runs | `FocusForest.postman_collection.json` | Signup test required `201` strictly; on re-runs Supabase returns `409 EMAIL_TAKEN` so `{{jwt}}` was never saved and all downstream tests failed | Signup test now accepts `201 OR 409`; on 409 it logs a warning and Login sets `{{jwt}}` |

---

## Live API Routes (all working)

| Week | Goal | Status |
|------|------|--------|
| Week 1 | Foundation + Auth + DB | ✅ **Complete** |
| Week 2 (partial) | Session engine + Tree endpoints | ✅ **Complete** |
| Week 2 (remaining) | Midnight cron + Streak logic | ✅ **Complete** |
| Week 3 | Groups API | ✅ **Complete** |
| Week 4 | Leaderboard (needs Upstash Redis) + Deploy | ⏳ Next |

---

## Still Needed (credentials)
- **Upstash Redis** — `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `REDIS_URL`  
  Required for: leaderboard sorted sets + BullMQ job queues  
  → Create free DB at [console.upstash.com](https://console.upstash.com)
