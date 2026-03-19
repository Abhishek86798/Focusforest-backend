# FocusForest — Backend Project Context

> This file is loaded automatically by Claude Code and most AI IDEs.
> It gives the AI the full context it needs before you describe any feature.

---

## What This Project Is

FocusForest is a collaborative study focus platform for college students.
Users grow one tree per day through Pomodoro study sessions.
Seven days of consistent effort builds a complete weekly forest.

**I am building the backend only. There is no frontend yet.**

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20 LTS |
| Framework | Express 4+ |
| Language | TypeScript 5+ |
| ORM | Prisma 5+ |
| Validation | Zod 3+ |
| Scheduler | node-cron 3+ |
| Job Queue | BullMQ 4+ |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth (JWT via httpOnly cookies) |
| Realtime | Supabase Realtime (pub/sub for live group sessions) |
| Cache / Queue store | Redis via Upstash |
| Hosting | Railway |

---

## The Single Most Important Rule

**The score engine runs server-side only. Never on the client.**

```
stage_progress = (focus_minutes / 25) × task_multiplier

task_multiplier:
  task completed  → 1.5
  task carried    → 1.0
  no task set     → 1.0
```

The client sends `{ variant, focus_minutes, task_status, client_session_id }`.
The server computes and returns the stage delta. Full stop.

---

## Core Mechanics

### One tree per day
- Same tree grows across all sessions in a calendar day
- At local midnight: tree is finalised at whatever stage it reached
- Missed day = bare soil (cannot be backdated or hidden)
- New seed starts the next day automatically

### Tree stages
| Stage | Name | Points needed |
|-------|------|---------------|
| 0 | Seed | 0 |
| 1 | Sprout | 1.0 |
| 2 | Sapling | 2.0 |
| 3 | Young Tree | 3.0 |
| 4 | Full Tree | 4.0 |

### Glow level (golden tree)
`glow_level = tasks_completed / total_sessions_today` → maps to 0–4 tier

### Streaks
- Increment by 1 for any day with at least 1 session
- Reset to 0 on a missed day
- Zero mechanical advantage — no bonuses, purely a display badge

### Groups
- Max 5 members including creator
- Ambient mode (default): every completed full tree auto-adds to group forest
- Live mode: shared timer, synced via Supabase Realtime

---

## Project Structure (target)

```
focusforest-backend/
├── src/
│   ├── index.ts              # Express app entry
│   ├── middleware/
│   │   └── auth.ts           # Supabase JWT verification
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── sessions.ts
│   │   ├── trees.ts
│   │   ├── groups.ts
│   │   └── leaderboard.ts
│   ├── services/
│   │   ├── scoreEngine.ts    # stage_progress formula — paste from PRD
│   │   ├── treeService.ts    # daily_trees upsert + glow calculation
│   │   ├── streakService.ts  # streak increment / reset logic
│   │   └── leaderboard.ts   # Redis sorted set reads/writes
│   ├── jobs/
│   │   ├── midnightReset.ts  # node-cron job
│   │   └── pushWorker.ts     # BullMQ worker
│   └── lib/
│       ├── prisma.ts         # Prisma client singleton
│       ├── redis.ts          # Upstash Redis client
│       └── supabase.ts       # Supabase admin client
├── prisma/
│   └── schema.prisma
├── .env
└── package.json
```

---

## Database Tables (Prisma)

```
users            — id, email, name, avatar_url, utc_offset, created_at
sessions         — id, user_id, variant, focus_minutes, task_text,
                   task_status, stage_progress, client_session_id, created_at
daily_trees      — id, user_id, date, stage, glow_level, total_sessions,
                   sessions_with_task, is_bare, finalised_at
streaks          — id, user_id, current_streak, longest_streak, last_active_date
groups           — id, name, admin_user_id, invite_code, member_count, created_at
group_members    — id, group_id, user_id, joined_at
push_subscriptions — id, user_id, endpoint, p256dh, auth, created_at
```

---

## API Routes Summary

```
POST   /api/v1/auth/signup
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/me

POST   /api/v1/sessions
GET    /api/v1/sessions

GET    /api/v1/trees/today
GET    /api/v1/trees/calendar
GET    /api/v1/trees/week/:weekId

POST   /api/v1/groups
POST   /api/v1/groups/join
GET    /api/v1/groups/:id
GET    /api/v1/groups/:id/calendar
DELETE /api/v1/groups/:id/members/:userId

GET    /api/v1/leaderboard/solo
GET    /api/v1/leaderboard/groups
```

---

## Hard Rules for AI Code Generation

- **Never** put the score engine formula on the client
- **Never** use `localStorage` for JWT tokens — use httpOnly cookies
- **Always** use Zod to validate every POST request body before touching the DB
- **Always** use `client_session_id` (UUID) on session submissions to deduplicate retries
- **Never** run the midnight cron on a single UTC time — batch by user `utc_offset`
- **Always** use Prisma for DB queries — no raw SQL unless Prisma cannot express it
- **Run** `npx prisma validate` after every schema change

---

## Full PRD

See `docs/PRD.md` for the complete product requirements document.
