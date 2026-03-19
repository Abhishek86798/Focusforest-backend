# FocusForest — Product Requirements Document

**Version:** 1.0  
**Type:** Web App + PWA  
**Status:** In Development — Backend Phase  
**Scope:** This document covers backend only. Frontend will be documented separately.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Core User Flow](#2-core-user-flow)
3. [Feature Requirements](#3-feature-requirements)
4. [Tech Stack — Backend](#4-tech-stack--backend)
5. [System Architecture](#5-system-architecture)
6. [API Reference](#6-api-reference)
7. [Out of Scope — v1.0](#7-out-of-scope--v10)
8. [Success Metrics](#8-success-metrics)
9. [Design Principles](#9-design-principles)
10. [Development Roadmap](#10-development-roadmap)

---

## 1. Product Overview

FocusForest is a collaborative study focus platform for college students. It combines structured Pomodoro-based focus sessions with a gamified forest growth system, group accountability, and social leaderboards.

The core belief: every minute of focused effort should feel visible, rewarding, and worth protecting. Users grow one tree per day through accumulated study sessions — seven days of consistent effort builds a complete weekly forest. The forest is not a number or a score. It is a living, honest record of how hard the user showed up.

### 1.1 Problem Statement

College students struggle with three compounding problems:

- Chronic distraction during study sessions
- Lack of accountability when studying alone
- No visible measure of long-term consistent effort

Existing tools like timers and to-do apps address these in isolation but fail to create emotional investment or social motivation. FocusForest solves all three in one product loop.

### 1.2 Target Users

| User Type | Description |
|-----------|-------------|
| Primary | Undergraduate college students aged 18–24 who study alone or in small friend groups, struggle with phone distractions and procrastination, and respond to visual progress and social comparison. |
| Secondary | Any self-directed learners who want structured focus sessions with long-term progress tracking. |

---

## 2. Core User Flow

1. Sign up / Log in
2. Land on Dashboard — see today's live tree + current streak
3. Click 'Start Session' — pick a timer variant
4. Optionally set a task for this session
5. Focus — timer runs, task reminder visible at top
6. Timer ends — popup: task done or carry forward?
7. Session logged — daily tree advances one or more stages
8. Repeat until tree is complete (4 stages)
9. At midnight — tree finalised, streak increments, new seed starts
10. After 7 consecutive days — weekly forest archived

> **NOTE:** The session popup is the most important moment of friction in the product. It forces honest reflection: did I actually finish what I planned? The answer directly affects how the tree looks (golden vs plain).

---

## 3. Feature Requirements

### 3.1 Authentication & Profile

- Email / password sign up and login via Supabase Auth
- JWT tokens — stored in httpOnly cookies, not localStorage
- Profile contains: name, avatar, personal all-time forest, current streak, stats
- Stats tracked: total focus minutes, total trees completed, sessions completed, task completion rate
- Streak count displayed prominently — visible to other users
- All-time forest visible on profile as the user's permanent lifetime record

### 3.2 Timer Variants

Users select a timer variant before every session. The variant is just a config object — one shared timer engine handles all of them.

| Variant | Focus | Short Break | Long Break | Stage Progress / Session |
|---------|-------|-------------|------------|--------------------------|
| Sprint | 15 min | 3 min | 10 min | 0.6 stages |
| Classic (default) | 25 min | 5 min | 20 min | 1.0 stage (base) |
| Deep Work | 50 min | 10 min | 30 min | 2.0 stages |
| Flow | 90 min | 15 min | 45 min | 3.6 stages |
| Custom | User-defined | User-defined | User-defined | focus_minutes / 25 |

- Users can check 'Always use this' to skip the picker on future sessions
- After 4 focus sessions, a long break is triggered automatically
- In group live sessions, the session starter picks the variant for everyone

### 3.3 Focus Session

After picking a timer variant, user is prompted: *"What do you want to accomplish this session?"* (optional)

On timer completion, a popup appears before the break starts:

```
Session Complete!
Task: "Finish Chapter 4 notes"
[ Done ] [ Carry Forward ]
```

| User Action | Outcome |
|-------------|---------|
| Done | Task marked complete. Session contributes 1.5x stage progress (golden effect). |
| Carry Forward | Task auto-fills into next session. Session contributes 1.0x stage progress. |
| No task set | Session contributes 1.0x stage progress. No glow effect. |

> **CRITICAL:** The stage progress formula runs server-side only. The client sends `{ variant, focus_minutes, task_status }` and receives the computed stage delta. This prevents users from manipulating their tree growth.

### 3.4 Daily Tree Growth Mechanic

**Core rule: one tree per day. The same tree grows across all sessions that day. At midnight it resets and a new seed starts the next day.**

#### Stage Progress Formula

```
stage_progress = (focus_minutes / 25) × task_multiplier

task_multiplier:
  completed  → 1.5
  carried    → 1.0
  none       → 1.0
```

#### Tree Stages

| Stage | Name | Visual | Cumulative Points Needed |
|-------|------|--------|--------------------------|
| 0 | Seed | Dark bare soil — no growth yet | 0 |
| 1 | Sprout | Tiny green shoot emerging | 1.0 |
| 2 | Sapling | Small leafed branch | 2.0 |
| 3 | Young Tree | Half-grown tree with canopy | 3.0 |
| 4 | Full Tree | Complete tree (daily goal met) | 4.0 |

#### Sessions Needed to Complete One Tree

| Variant | No Task (1.0x) | All Tasks Done (1.5x) |
|---------|----------------|------------------------|
| Sprint (15 min) | 7 sessions | 5 sessions |
| Classic (25 min) | 4 sessions | 3 sessions |
| Deep Work (50 min) | 2 sessions | 2 sessions |
| Flow (90 min) | 1 session | 1 session |

> **MIDNIGHT:** If a tree is not fully grown at midnight, it is saved at whatever stage it reached. A completely missed day shows bare soil — it cannot be hidden or backdated.

### 3.5 Golden Tree — Task Completion Appearance

Tree visual appearance reflects how many sessions that day had completed tasks. Based on a standard 4-session Classic day:

| Tasks Completed | Tree Appearance |
|-----------------|-----------------|
| 4 out of 4 | Full golden glow — most beautiful state |
| 3 out of 4 | Strong glow |
| 2 out of 4 | Faint glow |
| 1 out of 4 | Slight shimmer |
| 0 out of 4 | Plain tree — no glow |

Glow formula: `tasks_completed / total_sessions_today` → maps to glow tier. Scales proportionally for non-Classic sessions.

### 3.6 Weekly Forest

- One week = Monday to Sunday = 7 day slots
- Weekly forest is complete only when all 7 day slots have at least one session (minimum Sprout stage)
- Volume in a single day does not complete the weekly forest — consistency across all 7 days is the only path
- Completed weeks are archived in the calendar permanently

### 3.7 Calendar — Solo View

Two views: Daily Grid and Monthly/Weekly view.

**Daily Grid View (Default)**
- Inspired by GitHub contribution graph — scrollable grid where each cell = one day
- Each cell displays the day's tree stage and glow level
- Bare soil shown for days with 0 sessions
- Tapping any cell opens a day-detail panel: sessions count, variant used, tasks set, task outcomes

**Monthly View**
- Shows current month as 4 week boxes stacked vertically
- Each box = one week row: 7 tree icons + complete/incomplete badge
- Tapping a week box opens the weekly forest detail view

### 3.8 Calendar — Group View

**Group Daily View**
- Each day shows the group's collective output: members studied, trees completed, stages reached per member
- Tapping a day shows a per-member breakdown: stage, sessions done, streak count
- This is the accountability screen — members can see exactly who showed up

**Group Monthly View**
- Same 4 week boxes as solo
- Tapping a week box shows trees from all members together

### 3.9 Groups

> **MAX:** Group size is capped at 5 members including the creator. Groups are persistent — members stay until they leave or are removed by the admin.

**Creating a Group**
- User creates a group with a name
- System generates a shareable invite link and a 6-digit join code
- Creator becomes group admin
- Once 5 members have joined, the invite link is automatically disabled

**Two Group Modes**

| Mode | Behaviour |
|------|-----------|
| Ambient (default) | Members study independently on their own schedule. Every session any member completes automatically contributes to the group forest passively. No coordination needed. Group forest grows 24/7. |
| Live Session | Any member hits 'Start Group Session'. All members receive a push notification. Members who join are synced to the same timer and variant. |

**Group Tree Counting**
- Each member grows their own daily tree independently (solo rules apply exactly)
- When a member completes their daily full tree → 1 tree added to group forest
- Group forest = sum of all members' completed daily trees, all time
- Group weekly forest complete = at least 1 member grew a tree on all 7 days

### 3.10 Streaks

- Streak increments by 1 for every calendar day in which at least 1 session is completed
- Streak resets to 0 if a full day is missed
- Zero mechanical advantage — no stage bonuses, no multipliers whatsoever
- Streak is a pure consistency badge — displayed on profile and leaderboard
- Daily push notification: *"Your forest is waiting to grow today"*

### 3.11 Leaderboard

- Solo leaderboard: ranked by total all-time completed trees
- Group leaderboard: ranked by total group forest size (all members, all time)
- Scope toggle: Global (all users) or Friends (members across your groups only)
- Streak count visible alongside each user's rank on both leaderboards

---

## 4. Tech Stack — Backend

### 4.1 Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20 LTS | Runtime environment |
| Express | 4+ | REST API routing and middleware |
| Prisma ORM | 5+ | Type-safe database queries and migrations |
| Zod | 3+ | Runtime validation of all API request bodies |
| node-cron | 3+ | Midnight tree finalisation and streak jobs |
| BullMQ | 4+ | Background job queue for push notifications |
| TypeScript | 5+ | Type safety across entire codebase |

### 4.2 Data Layer

| Technology | Purpose | Notes |
|------------|---------|-------|
| Supabase PostgreSQL | Primary database | Users, sessions, trees, groups, streaks |
| Supabase Auth | Authentication | JWT tokens, email/password, session management |
| Supabase Realtime | Live group sessions | Pub/sub channels per group for timer sync |
| Redis (Upstash) | Leaderboard + queues | Sorted sets for rankings, BullMQ job store |

### 4.3 Infrastructure — Backend Hosting

| Service | Hosts | Notes |
|---------|-------|-------|
| Railway | Node.js API + workers | Simple deploys, env management, free tier for v1.0 |
| Web Push API | Push notifications | Via web-push npm package, no Firebase needed |

---

## 5. System Architecture

### 5.1 Architecture Zones

| Zone | Technologies | Responsibility |
|------|-------------|----------------|
| API Layer | Node.js, Express, Zod, Prisma | Request handling, auth middleware, score engine, DB writes |
| Data Layer | Supabase PG, Auth, Realtime, Redis | Persistence, auth tokens, real-time pub/sub, leaderboard cache |
| Background Jobs | node-cron, BullMQ | Midnight resets, streak logic, push notification dispatch |

### 5.2 Session Submission Flow

This is the most critical path in the system. Every timer completion runs through these steps in order:

1. API receives `POST /sessions` with `{ variant, focus_minutes, task_status, client_session_id }`
2. Auth middleware — verify Supabase JWT token
3. Zod schema validation — sanitise and type-check request body
4. Score engine — compute `stage_progress = (focus_minutes / 25) × task_multiplier` **(server only)**
5. Prisma write — insert `sessions` row, update `daily_trees` row in PostgreSQL
6. BullMQ enqueue — async streak check job (non-blocking)
7. Return 200 — updated tree stage + glow level + streak to client

### 5.3 Midnight Reset Job

1. `node-cron` fires at 00:00 per timezone group (batch users by UTC offset)
2. Fetch all active users in that timezone batch
3. Finalise `daily_trees` row — lock stage at current value, flag bare soil if 0 sessions
4. Streak evaluation — increment if at least 1 session, reset to 0 if bare soil
5. Leaderboard write — `ZADD` to Redis sorted set
6. Weekly check — if all 7 days have sessions, archive as completed week
7. Enqueue tomorrow's push notification reminder via BullMQ
8. Insert new `daily_trees` seed row for the next calendar day

> **TIMEZONE:** Do not use a single UTC midnight cron. Store each user's UTC offset at signup. Run the cron every hour and process users whose local time is currently 00:00. This ensures trees reset at the correct local midnight.

### 5.4 Database Schema

Core tables in PostgreSQL (managed via Prisma migrations):

| Table | Key Columns |
|-------|-------------|
| `users` | id, email, name, avatar_url, utc_offset, created_at |
| `sessions` | id, user_id, variant, focus_minutes, task_text, task_status, stage_progress, client_session_id, created_at |
| `daily_trees` | id, user_id, date, stage (0–4), glow_level (0–4), total_sessions, sessions_with_task, is_bare, finalised_at |
| `streaks` | id, user_id, current_streak, longest_streak, last_active_date |
| `groups` | id, name, admin_user_id, invite_code, member_count (max 5), created_at |
| `group_members` | id, group_id, user_id, joined_at |
| `push_subscriptions` | id, user_id, endpoint, p256dh, auth, created_at |

---

## 6. API Reference

**Base URL:** `/api/v1`  
All endpoints require `Authorization: Bearer {jwt}` unless marked public.

### 6.1 Auth Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/signup` | Create account with email + password. Returns JWT. |
| POST | `/auth/login` | Login. Returns JWT + refresh token. |
| POST | `/auth/logout` | Invalidate session token. |
| GET | `/auth/me` | Get current user profile. |

### 6.2 Session Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sessions` | Submit completed session. Runs score engine. Returns updated tree state. |
| GET | `/sessions` | Get session history for current user. Supports date range filters. |

**POST `/sessions` — Request body:**

```json
{
  "variant": "classic | sprint | deep_work | flow | custom",
  "focus_minutes": 25,
  "task_text": "Finish Chapter 4 notes",
  "task_status": "completed | carried | none",
  "client_session_id": "uuid-v4"
}
```

**POST `/sessions` — Response:**

```json
{
  "tree": {
    "stage": 2,
    "glow_level": 3,
    "stage_progress": 2.5
  },
  "streak": {
    "current_streak": 5
  }
}
```

### 6.3 Tree & Calendar Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/trees/today` | Get today's live tree state for current user. |
| GET | `/trees/calendar` | Get all daily_trees for current user. Supports `?month=3&year=2025` filter. |
| GET | `/trees/week/:weekId` | Get all 7 days of a specific week. |

### 6.4 Group Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/groups` | Create a new group. Returns group + invite code. |
| POST | `/groups/join` | Join a group via 6-digit invite code. |
| GET | `/groups/:id` | Get group details, members, forest stats. |
| GET | `/groups/:id/calendar` | Get group calendar — daily collective output. |
| DELETE | `/groups/:id/members/:userId` | Remove member (admin only) or leave group (self). |

### 6.5 Leaderboard Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/leaderboard/solo` | Solo rankings. Query: `?scope=global\|friends&page=1` |
| GET | `/leaderboard/groups` | Group rankings. Query: `?scope=global\|friends&page=1` |

---

## 7. Out of Scope — v1.0

| Feature | Reason Deferred |
|---------|-----------------|
| Real tree planting integration | External partnership complexity |
| Chat / messaging inside groups | Adds social media complexity |
| Session scheduling / calendar sync | Not part of core habit loop |
| Public profiles / social following | Scope creep — leaderboards serve this need |
| In-app achievement / badge system | Streaks and tree quality already provide milestones |
| Detailed analytics beyond weekly summary | Weekly stats are sufficient for v1.0 |
| Groups larger than 5 members | Intentional constraint |
| Live group sessions (Realtime) | Complex WebSocket state — build ambient mode first |
| Web push notifications | Requires service worker + PWA install flow |
| Rive animations | Use emoji/CSS tree for v1.0 |

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Users returning after Day 7 | > 40% |
| Average sessions per active user per week | >= 4 |
| % of sessions with a task set | > 60% |
| % of users who join or create a group | > 50% |
| Average streak length at Week 4 | >= 4 days |
| % of users completing a full weekly forest in Week 2 | > 30% |

---

## 9. Design Principles

| Principle | What it means in practice |
|-----------|--------------------------|
| Effort = Forest | Every screen reinforces that the forest is built by the user, not given. No shortcuts, no backdating. |
| One tree, one day | The daily tree is the heartbeat of the product. Everything — sessions, tasks, variants — serves this one goal. |
| No punishment for imperfection | Carrying a task forward still grows the tree. A partial tree at midnight is saved honestly. Only a missed day leaves bare soil. |
| Social without social media | Leaderboards and group forests create motivation without feeds, likes, or comments. |
| One decision at a time | Pick variant → set task → focus. No cognitive overload before a session. |
| Honest visual record | The calendar never lies. A bare soil day cannot be hidden. A golden tree cannot be faked. |

---

## 10. Development Roadmap (4 Weeks)

> **SCOPE:** Target for v1.0 is the working backend core — auth, session engine, tree growth, calendar endpoints, streak cron, and basic groups. Push notifications and live group sessions are post-launch.

### Week 1 — Foundation + Auth + Database

**Goal:** User can sign up, log in, and you can see their row in Supabase.

- [ ] Initialise Node.js + Express project with TypeScript
- [ ] Create Supabase project — configure email/password auth
- [ ] Design Prisma schema — create all core tables with migrations
- [ ] Configure Prisma to connect to Supabase PostgreSQL connection string
- [ ] Set up auth middleware — verify Supabase JWT on protected routes
- [ ] Build `POST /auth/signup` and `POST /auth/login` proxy routes
- [ ] Test: hit `/auth/signup` with Postman/Insomnia, confirm user row appears in Supabase dashboard

### Week 2 — Session Engine + Tree Logic

**Goal:** `POST /sessions` works, score engine runs server-side, `daily_trees` row updates correctly.

- [ ] Create `POST /api/v1/sessions` route with Zod validation
- [ ] Implement score engine: `stage_progress = (focus_minutes / 25) × task_multiplier`
- [ ] Write `daily_trees` upsert logic — create if first session of day, update stage otherwise
- [ ] Write `glow_level` calculation — `tasks_completed / total_sessions_today`
- [ ] Add `client_session_id` deduplication to prevent double-counting on retries
- [ ] Test with Postman: send various session payloads, verify correct stage in DB
- [ ] Write unit tests for score engine formula with edge cases

### Week 3 — Tree Endpoints + Streak + Midnight Cron

**Goal:** All tree and calendar read endpoints work. Midnight cron fires correctly and streak logic is accurate.

- [ ] Implement `GET /api/v1/trees/today` — return live tree state for current user
- [ ] Implement `GET /api/v1/trees/calendar` — return all `daily_trees` with optional month/year filter
- [ ] Implement `GET /api/v1/trees/week/:weekId` — return 7-day week data
- [ ] Implement `GET /api/v1/sessions` — session history with date range filters
- [ ] Implement timezone-aware midnight cron job with `node-cron`
- [ ] Write streak increment / reset logic triggered by cron
- [ ] Write weekly forest completion check — archive if all 7 days have sessions
- [ ] Test: hit `POST /sessions` multiple times across days, verify cron fires and streak increments correctly

### Week 4 — Groups + Leaderboard + Deploy

**Goal:** All group and leaderboard endpoints work. Backend is live on Railway.

- [ ] Implement `POST /api/v1/groups` — create group, generate 6-digit invite code
- [ ] Implement `POST /api/v1/groups/join` — validate invite code, add member (max 5 check)
- [ ] Implement `GET /api/v1/groups/:id` — group details, members, forest stats
- [ ] Implement `GET /api/v1/groups/:id/calendar` — collective daily output per member
- [ ] Wire midnight cron to write `ZADD` to Redis sorted set after each tree finalisation
- [ ] Implement `GET /api/v1/leaderboard/solo` and `/leaderboard/groups` from Redis
- [ ] Deploy backend to Railway — configure environment variables
- [ ] End-to-end test all endpoints via Postman collection — fix bugs
