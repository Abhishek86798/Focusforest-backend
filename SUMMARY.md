# FocusForest Backend — Session Summary

**Date:** 2026-03-20  
**Duration:** Single agent session  
**Starting point:** Empty folder with just [CLAUDE.md](file:///d:/SEM%206/HCI/FocusForest/CLAUDE.md) and [docs/PRD.md](file:///d:/SEM%206/HCI/FocusForest/docs/PRD.md)

---

## What Was Built

### 📁 AI IDE Context Files
Files that make every future AI code generation session more accurate:

| File | Purpose |
|------|---------|
| [prisma/schema.prisma](file:///d:/SEM%206/HCI/FocusForest/prisma/schema.prisma) | Full DB schema — all 7 tables with relations, indexes, enums |
| [.env.example](file:///d:/SEM%206/HCI/FocusForest/.env.example) | All required env vars with safe dummy values |
| [docs/API.md](file:///d:/SEM%206/HCI/FocusForest/docs/API.md) | Every endpoint with exact Zod schemas + request/response shapes |
| [docs/ERRORS.md](file:///d:/SEM%206/HCI/FocusForest/docs/ERRORS.md) | Standard `{ error: { code, message, details } }` envelope + helper code |
| [docs/DECISIONS.md](file:///d:/SEM%206/HCI/FocusForest/docs/DECISIONS.md) | 8 ADRs — why httpOnly cookies, server-side score engine, Redis leaderboard, etc. |

---

### 🗄️ Database
- Created Supabase project (Sydney, `ap-southeast-2`)
- Ran Prisma migration — all 7 tables live in Supabase:
  `users`, `sessions`, `daily_trees`, `streaks`, `groups`, `group_members`, `push_subscriptions`

---

### 🏗️ Project Foundation
Full Express + TypeScript backend bootstrapped from zero:

| File | Purpose |
|------|---------|
| [package.json](file:///d:/SEM%206/HCI/FocusForest/package.json) | `npm run dev / build / start` scripts |
| [tsconfig.json](file:///d:/SEM%206/HCI/FocusForest/tsconfig.json) | Strict TypeScript, Node 20, commonjs output |
| [src/index.ts](file:///d:/SEM%206/HCI/FocusForest/src/index.ts) | Express app — CORS, cookies, router mounts, `/health` |
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
| [src/routes/sessions.ts](file:///d:/SEM%206/HCI/FocusForest/src/routes/sessions.ts) | `POST /sessions` — auth → dedup → score → DB write → tree upsert → streak → response |
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

## Live API Routes (all working)

```
GET  /health                              no auth
POST /api/v1/auth/signup                  no auth
POST /api/v1/auth/login                   no auth
POST /api/v1/auth/logout                  Bearer JWT
GET  /api/v1/auth/me                      Bearer JWT
POST /api/v1/sessions                     Bearer JWT
GET  /api/v1/sessions                     Bearer JWT
GET  /api/v1/trees/today                  Bearer JWT
GET  /api/v1/trees/calendar               Bearer JWT
GET  /api/v1/trees/week/:weekId           Bearer JWT
```

---

## PRD Roadmap Status

| Week | Goal | Status |
|------|------|--------|
| Week 1 | Foundation + Auth + DB | ✅ **Complete** |
| Week 2 (partial) | Session engine + Tree endpoints | ✅ **Complete** |
| Week 2 (remaining) | Midnight cron + Streak logic | ✅ **Complete** |
| Week 3 | Groups API | ⏳ Next |
| Week 4 | Leaderboard (needs Upstash Redis) + Deploy | ⏳ Next |

---

## Still Needed (credentials)
- **Upstash Redis** — `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `REDIS_URL`  
  Required for: leaderboard sorted sets + BullMQ job queues  
  → Create free DB at [console.upstash.com](https://console.upstash.com)
