# FocusForest API — Quick Reference Card

**Base URL:** `/api/v1`  
**Auth:** All endpoints use httpOnly cookies (automatic with `credentials: 'include'`)

---

## 🔐 Authentication

```typescript
// Signup
POST /auth/signup
{ email, password, name, utcOffset? }
→ { user: { id, email, name, avatarUrl, utcOffset } }

// Login
POST /auth/login
{ email, password }
→ { user: { id, email, name, avatarUrl } }

// Get current user
GET /auth/me
→ { id, email, name, avatarUrl, utcOffset, isPrivate, createdAt }

// Update profile
PATCH /auth/profile
{ name?, avatarUrl?, isPrivate? }
→ { id, email, name, avatarUrl, utcOffset, isPrivate, createdAt }

// Logout
POST /auth/logout
→ { message: "Logged out" }
```

---

## ⏱️ Sessions

```typescript
// Start immersive session
POST /sessions/start
{ variant, focusMinutes, taskText?, clientSessionId }
→ { sessionId, expectedEndAt }

// Complete session
POST /sessions/:id/complete
{ taskStatus: "completed" | "carried" | "none" }
→ { tree: { stage, glowLevel, stageProgress, totalSessions }, streak: { currentStreak } }

// Abandon session
POST /sessions/:id/abandon
→ { message }

// Legacy instant submit
POST /sessions
{ variant, focusMinutes, taskText?, taskStatus, clientSessionId }
→ { tree, streak }

// Get session history
GET /sessions?startDate=&endDate=&limit=50&offset=0
→ { sessions: [...], total }
```

---

## 🌳 Trees & Calendar

```typescript
// Today's tree
GET /trees/today
→ { date, stage, glowLevel, totalSessions, sessionsWithTask, isBare, finalisedAt }

// Full calendar
GET /trees/calendar?month=4&year=2026
→ { trees: [{ date, stage, glowLevel, totalSessions, sessionsWithTask, isBare, finalisedAt }] }

// Week view
GET /trees/week/2026-W15
→ { weekId, startDate, endDate, complete, days: [...] }
```

---

## 👥 Groups

```typescript
// List user's groups
GET /groups
→ { groups: [{ id, name, description, memberCount, activeMemberCount, isAdmin }] }

// Create group
POST /groups
{ name }
→ { id, name, inviteCode, memberCount, createdAt }

// Join group
POST /groups/join
{ inviteCode }
→ { id, name, memberCount }

// Group details
GET /groups/:id
→ { id, name, inviteCode, memberCount, adminUserId, members: [...], forestStats, createdAt }

// Group stats
GET /groups/:id/stats
→ { totalMinutes, treesCompleted, sessions, todayTreeCount }

// Member status
GET /groups/:id/members/status
→ { members: [{ userId, name, avatarUrl, status, personalStreak, contribution }] }

// Group calendar
GET /groups/:id/calendar?month=4&year=2026
→ { days: [{ date, members: [...] }] }

// Delete group (admin only)
DELETE /groups/:id
→ { message }

// Leave group
DELETE /groups/:id/members/:userId
→ { message }
```

---

## 🏆 Leaderboard

```typescript
// Solo leaderboard
GET /leaderboard/solo?page=1&limit=20
→ { entries: [{ rank, userId, name, avatarUrl, totalTrees, currentStreak }], page, limit }

// Group leaderboard
GET /leaderboard/groups?page=1&limit=20
→ { entries: [{ rank, groupId, name, totalTrees, memberCount }], page, limit }
```

---

## 📊 Stats

```typescript
// Summary stats
GET /stats/summary
→ { totalMinutes, treesCompleted, sessions, taskCompletionRate }

// Streak info
GET /stats/streak
→ { currentStreak, longestStreak, lastActiveDate }
```

---

## ⏲️ Timer & Preferences

```typescript
// Get timer variants
GET /timer/variants
→ { variants: [{ id, label, focusMinutes }] }

// Get user preferences
GET /user/preferences
→ { selectedVariant, leafCount, lastTaskText }

// Update preferences
PATCH /user/preferences
{ selectedVariant?, lastTaskText? }
→ { ok: true }
```

---

## 🎯 Common Patterns

### Error Response Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [...]
  }
}
```

### Pagination
```typescript
?page=1&limit=20  // Most list endpoints
```

### Date Formats
```typescript
date: "2026-04-07"           // YYYY-MM-DD
weekId: "2026-W15"           // ISO week
createdAt: "2026-04-07T..."  // ISO 8601
```

### Timer Variants
```typescript
"classic"   // 25 min
"sprint"    // 10 min
"deep"      // 45 min
"ultra"     // 90 min
```

### Task Status
```typescript
"completed" // Task done (1.5x multiplier)
"carried"   // Task ongoing (1.0x multiplier)
"none"      // No task (1.0x multiplier)
```

### Tree Stages
```typescript
0 // Seed (0 points)
1 // Sprout (1.0 points)
2 // Sapling (2.0 points)
3 // Young Tree (3.0 points)
4 // Full Tree (4.0 points)
```

---

## 🚨 Common Error Codes

| Code | Meaning | Common Cause |
|------|---------|--------------|
| `UNAUTHORIZED` | 401 | Missing or invalid JWT token |
| `VALIDATION_ERROR` | 400 | Invalid request body/params |
| `EMAIL_TAKEN` | 409 | Email already registered |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `NOT_GROUP_MEMBER` | 403 | User not in group |
| `NOT_GROUP_ADMIN` | 403 | User not group admin |
| `SESSION_TOO_SHORT` | 400 | Completed before 80% elapsed |
| `SESSION_NOT_ACTIVE` | 400 | Session already completed/abandoned |
| `DUPLICATE_SESSION` | 409 | clientSessionId already used |

---

## 📱 Screen-to-Endpoint Mapping

| Screen | Primary Endpoints |
|--------|------------------|
| Home (Timer) | `/stats/streak`, `/timer/variants`, `/user/preferences` |
| Timer Focus | `/sessions/start`, `/sessions/:id/complete`, `/sessions/:id/abandon` |
| Zen Mode | `/stats/summary` |
| Dashboard | `/stats/streak`, `/stats/summary`, `/trees/week/:weekId`, `/sessions` |
| Calendar | `/trees/calendar`, `/trees/week/:weekId`, `/stats/summary` |
| Groups | `/groups`, `/groups/:id/stats`, `/groups/:id/members/status` |
| Leaderboard | `/leaderboard/solo`, `/leaderboard/groups` |
| Profile | `/auth/me`, `/stats/streak`, `/stats/summary`, `/user/preferences` |

---

## 🔗 Full Documentation

- **Complete API Reference:** [API.md](./API.md)
- **Frontend Integration Guide:** [FRONTEND_INTEGRATION_GUIDE.md](./FRONTEND_INTEGRATION_GUIDE.md)
- **Gap Analysis:** [UI_API_GAP_ANALYSIS.md](../UI_API_GAP_ANALYSIS.md)
- **Postman Collection:** [FocusForest_Complete_v2.postman_collection.json](./FocusForest_Complete_v2.postman_collection.json)
