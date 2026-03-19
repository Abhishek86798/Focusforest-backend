# FocusForest — Architecture Decision Log

This file records **why** we made architectural choices — not what we chose (the PRD covers that), but the reasoning behind the decision. Update this file whenever a significant decision is made or revisited.

---

## Decision Format

```
## [ADR-###] Short title
**Date:** YYYY-MM-DD
**Status:** Accepted | Superseded | Deprecated
**Supersedes:** ADR-### (if applicable)

### Context
What situation forced this decision?

### Decision
What was chosen?

### Rationale
Why this option over alternatives?

### Consequences
What does this decision make easier? Harder?
```

---

## ADR-001: httpOnly cookies over localStorage for JWT storage
**Date:** 2025-03-01  
**Status:** Accepted

### Context
Supabase Auth returns a JWT access token and a refresh token. We need to decide how to persist these on the client.

### Decision
Store both tokens in `httpOnly`, `Secure`, `SameSite=Strict` cookies. Never expose them to JavaScript.

### Rationale
- `localStorage` is accessible to any JavaScript running on the page — vulnerable to XSS attacks.
- `httpOnly` cookies are invisible to JS entirely. Even a full XSS compromise cannot read the token.
- The backend already controls auth, so cookie-based auth fits the architecture naturally.
- Supabase Auth's JS client defaults to localStorage — we override this with the `@supabase/ssr` package which supports cookie-based auth.

### Consequences
- ✅ Significantly more secure than localStorage.
- ✅ Works seamlessly with server-side rendering when we add a frontend.
- ⚠️ Requires explicit CORS configuration (must set `credentials: true`).
- ⚠️ CSRF protection must be considered (mitigated by `SameSite=Strict`).

---

## ADR-002: Score engine is server-side only
**Date:** 2025-03-01  
**Status:** Accepted

### Context
The `stage_progress` formula (`(focus_minutes / 25) × task_multiplier`) determines how fast a user's tree grows. This is the core of the gamification loop.

### Decision
The formula runs **only on the server**. The client sends raw inputs `{ variant, focus_minutes, task_status }` and receives the computed `stageProgress`. The client never computes or sends `stageProgress`.

### Rationale
- If the formula ran client-side, a user could send arbitrary `stageProgress` values via Postman or a modified JS payload and skip sessions.
- Server-side computation is the only way to guarantee the game is honest.
- The formula is simple enough that server overhead is negligible.

### Consequences
- ✅ Tree growth cannot be manipulated by clients.
- ✅ Formula changes in the future only require a server deploy, not a client release.
- ⚠️ The client cannot show a "preview" of tree growth before submitting — must show after response returns.

---

## ADR-003: Redis sorted sets for leaderboard via Upstash
**Date:** 2025-03-01  
**Status:** Accepted

### Context
The leaderboard shows rankings for potentially thousands of users by total completed trees. We need rankings to be fast on every page load.

### Decision
Use Redis sorted sets (`ZADD` / `ZRANGE`) via Upstash for leaderboard reads. Written to by the midnight cron job after each tree is finalised. PostgreSQL is the source of truth; Redis is the read cache.

### Rationale
- `ZREVRANGE` and `ZRANK` in Redis are O(log N) — sub-millisecond even at large scale.
- Reading leaderboard from PostgreSQL would require a full table scan with `ORDER BY` on every request.
- Upstash is serverless Redis — no always-on instance cost, fits Railway free tier.
- The leaderboard only needs to be accurate at midnight (after tree finalisation), not real-time.

### Consequences
- ✅ Leaderboard reads are extremely fast.
- ✅ Zero load on PostgreSQL for leaderboard queries.
- ⚠️ Leaderboard data is eventually consistent — updated at midnight, not in real-time.
- ⚠️ If Redis goes down or data is cleared, we can re-seed from PostgreSQL. Write a seed script for this.

---

## ADR-004: Timezone-aware midnight cron instead of a single UTC cron
**Date:** 2025-03-01  
**Status:** Accepted

### Context
The daily tree must reset at the user's local midnight, not UTC midnight. FocusForest has users across India (IST +5:30) and potentially other timezones.

### Decision
Store each user's UTC offset in minutes at signup (`utc_offset` column on `users`). Run `node-cron` **every hour**. In each hourly run, query for all users whose local time is currently 00:00 and process their midnight reset.

### Rationale
- A single UTC midnight cron would reset all trees at the wrong time for every non-UTC user.
- Hourly batching groups users with the same UTC offset efficiently.
- `utc_offset` in whole minutes handles half-hour and 45-minute offset timezones (India, Australia, Nepal, etc.).

### Consequences
- ✅ Every user's tree resets at their actual local midnight.
- ✅ Handles all timezone offsets including half-hour offsets.
- ⚠️ Hourly cron processes users in batches — a user's midnight reset could fire up to 59 minutes late. Acceptable.
- ⚠️ Daylight saving transitions could cause issues for DST-observing timezones. For v1.0, UTC offset is static. DST support is a post-launch concern.

---

## ADR-005: `client_session_id` for session deduplication
**Date:** 2025-03-01  
**Status:** Accepted

### Context
A session submission (`POST /sessions`) is the most critical write operation. Mobile or poor-connection users may retry a network request, causing the same session to be counted twice and giving the user double tree progress.

### Decision
The client generates a UUID v4 (`client_session_id`) before a session starts and sends it with the submission. The database has a unique constraint on this column. If the same `client_session_id` is received twice, the second insert is rejected with `409 DUPLICATE_SESSION`.

### Rationale
- This is the standard idempotency key pattern for payment APIs. Same principle applies here.
- The client can safely retry on network failure without fear of double-counting.
- UUID v4 has negligible collision probability.

### Consequences
- ✅ Session submissions are idempotent — safe to retry.
- ✅ Prevents cheating by resubmitting the same session.
- ⚠️ Client must generate and persist the UUID before starting the timer, not after.

---

## ADR-006: Prisma ORM over raw SQL
**Date:** 2025-03-01  
**Status:** Accepted

### Context
We need a way to query Supabase PostgreSQL from Node.js. Options: raw `pg`, Drizzle ORM, Prisma.

### Decision
Use Prisma 5+ as the ORM. Fall back to `prisma.$queryRaw` only when Prisma's query builder cannot express the query.

### Rationale
- Prisma provides full TypeScript types for every query result — no manual type assertions.
- Schema-first approach: `schema.prisma` is a single source of truth for the database shape.
- `prisma migrate dev` handles migration history automatically.
- Slightly heavier than Drizzle but far less error-prone for a beginner-intermediate team.

### Consequences
- ✅ Every DB query is fully typed end-to-end.
- ✅ AI IDEs can read `schema.prisma` and write correct queries without guessing column names.
- ⚠️ Prisma's query builder cannot express all PostgreSQL features (e.g. partial indexes, some window functions). Use raw queries for these sparingly.
- ⚠️ Prisma Client must be regenerated after every schema change (`npx prisma generate`).

---

## ADR-007: BullMQ for push notifications, not inline
**Date:** 2025-03-01  
**Status:** Accepted

### Context
After each midnight tree finalisation, we want to enqueue a push notification reminder for the next day. Sending push notifications synchronously in the cron job would block the reset loop and cause failures if the push service is slow.

### Decision
Enqueue push jobs to a BullMQ queue backed by Upstash Redis. A separate BullMQ worker process consumes the queue asynchronously.

### Rationale
- Push notification delivery can take 1–3 seconds per subscriber. Blocking the cron for thousands of users is unacceptable.
- BullMQ provides retries, backoff, and dead-letter queues out of the box.
- Same Redis instance (Upstash) used for both leaderboard and BullMQ — no extra service to manage.

### Consequences
- ✅ Cron job completes in milliseconds — push delivery is fully decoupled.
- ✅ Failed pushes are retried automatically.
- ⚠️ Push notifications are delivered slightly after midnight (seconds to minutes delay).
- ⚠️ Worker process must be running separately from the main API. Configure Railway to run both.

---

## ADR-008: Max group size of 5 members
**Date:** 2025-03-01  
**Status:** Accepted

### Context
Groups are a core accountability feature. We need to decide the maximum group size.

### Decision
Hard cap at 5 members including the creator.

### Rationale
- The research on effective accountability groups (e.g. study groups, mastermind groups) consistently points to 3–6 as the sweet spot.
- Larger groups reduce individual accountability — it's easier to hide behind others' activity.
- Smaller, tighter groups create stronger social motivation to show up.
- Technically: smaller groups mean the group calendar view is always readable. 20-member group calendars become cluttered.

### Consequences
- ✅ Every member's contribution is visible and meaningful.
- ✅ Calendar view is always clean.
- ⚠️ Power users with large friend networks cannot add everyone. This is intentional.
- ⚠️ Users can create multiple groups but each group stays intimate. This is fine.
