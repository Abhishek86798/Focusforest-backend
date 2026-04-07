# Design Document: User Stats Endpoints

## Overview

This feature adds two new authenticated API endpoints to the FocusForest backend that provide user statistics for the dashboard screen. The endpoints aggregate data from the `sessions`, `daily_trees`, and `streaks` tables to display summary metrics and streak information.

The implementation follows existing patterns from `auth.ts`, `sessions.ts`, and `treeService.ts`, using:
- Express Router for route handling
- `requireAuth` middleware for authentication
- Zod for request validation
- Prisma aggregation functions for database queries
- Standard `apiError` helper for error responses

## Architecture

### Component Structure

```
src/routes/stats.ts          # Express router with two GET endpoints
src/services/statsService.ts # Service layer for database aggregations
src/index.ts                 # Mount stats router at /api/v1/stats
```

### Request Flow

```
Client Request
    ↓
requireAuth middleware (validates JWT, sets req.userId)
    ↓
validate middleware (validates query params with Zod)
    ↓
Route handler (calls statsService)
    ↓
statsService (Prisma aggregations)
    ↓
Response (JSON with stats data)
```

### Authentication

Both endpoints require authentication via the existing `requireAuth` middleware:
- Validates `Authorization: Bearer <token>` header
- Extracts and verifies Supabase JWT
- Attaches `req.userId` to request object
- Returns 401 UNAUTHORIZED if token is missing or invalid

## Components and Interfaces

### Route Handlers

**File:** `src/routes/stats.ts`

Two GET endpoints:
1. `GET /api/v1/stats/summary` - Returns aggregate statistics
2. `GET /api/v1/stats/streak` - Returns streak information

Both endpoints:
- Use `requireAuth` middleware
- Use `validate` middleware with empty Zod schema (no query params needed)
- Call corresponding service functions
- Return 200 OK with JSON response
- Use `apiError` helper for error responses

### Service Layer

**File:** `src/services/statsService.ts`

Two service functions:
1. `getSummaryStats(userId: string): Promise<SummaryStats>`
2. `getStreakStats(userId: string): Promise<StreakStats>`

Both functions:
- Accept `userId` as parameter
- Use Prisma client for database queries
- Use aggregation functions (count, sum, avg)
- Filter sessions by `state = 'completed'`
- Handle edge cases (zero sessions, missing streak record)

## Data Models

### SummaryStats Interface

```typescript
interface SummaryStats {
  totalMinutes: number;      // Sum of focus_minutes from completed sessions
  treesCompleted: number;    // Count of daily_trees where stage = 4
  sessions: number;          // Count of completed sessions
  taskCompletionRate: number; // Ratio of completed tasks to total sessions (0-1)
}
```

### StreakStats Interface

```typescript
interface StreakStats {
  currentStreak: number;     // Current consecutive days
  longestStreak: number;     // All-time longest streak
  lastActiveDate: string | null; // YYYY-MM-DD format or null
}
```

### Database Queries

**Summary Statistics:**

```typescript
// Total minutes - sum of focus_minutes
const minutesAgg = await prisma.session.aggregate({
  where: { userId, state: 'completed' },
  _sum: { focusMinutes: true }
});

// Trees completed - count where stage = 4
const treesCount = await prisma.dailyTree.count({
  where: { userId, stage: 4 }
});

// Total sessions - count completed
const sessionsCount = await prisma.session.count({
  where: { userId, state: 'completed' }
});

// Task completion rate - count with taskStatus = 'completed'
const tasksCompletedCount = await prisma.session.count({
  where: { userId, state: 'completed', taskStatus: 'completed' }
});
```

**Streak Statistics:**

```typescript
const streak = await prisma.streak.findUnique({
  where: { userId },
  select: {
    currentStreak: true,
    longestStreak: true,
    lastActiveDate: true
  }
});
```

## Error Handling

### Error Scenarios

1. **Unauthenticated Request**
   - Status: 401 UNAUTHORIZED
   - Error Code: `UNAUTHORIZED`
   - Message: "Authentication required. Please log in."
   - Handled by: `requireAuth` middleware

2. **Invalid Query Parameters**
   - Status: 400 VALIDATION_ERROR
   - Error Code: `VALIDATION_ERROR`
   - Message: "Request body is invalid."
   - Handled by: `validate` middleware

3. **Database Error**
   - Status: 500 INTERNAL_ERROR
   - Error Code: `INTERNAL_ERROR`
   - Message: "Failed to fetch statistics. Please try again."
   - Handled by: try-catch in route handler

### Edge Cases

1. **User with Zero Sessions**
   - `totalMinutes`: 0
   - `treesCompleted`: 0
   - `sessions`: 0
   - `taskCompletionRate`: 0 (not NaN or undefined)

2. **User with No Streak Record**
   - `currentStreak`: 0
   - `longestStreak`: 0
   - `lastActiveDate`: null

3. **User with Only Abandoned Sessions**
   - All counts should be 0 (only `state = 'completed'` sessions count)

## Testing Strategy

### Unit Tests

**Summary Endpoint Tests:**
- Returns correct aggregated statistics for user with multiple sessions
- Returns zeros for user with no completed sessions
- Calculates task completion rate correctly (completed / total)
- Returns 0 task completion rate when sessions count is 0
- Filters out abandoned sessions (only counts completed)
- Returns 401 when not authenticated

**Streak Endpoint Tests:**
- Returns streak data when record exists
- Returns zeros and null when no streak record exists
- Formats lastActiveDate as YYYY-MM-DD
- Returns 401 when not authenticated

**Service Layer Tests:**
- `getSummaryStats` performs correct Prisma aggregations
- `getStreakStats` handles missing streak record gracefully
- Both functions use correct where clauses (userId, state filter)

### Integration Tests

- End-to-end test with real database (or test database)
- Create test user with known session data
- Verify aggregated statistics match expected values
- Test with multiple users to ensure isolation

### Manual Testing

- Use Postman collection to test both endpoints
- Test with different user accounts (new user, active user, inactive user)
- Verify response format matches API documentation
- Test authentication failure scenarios

## API Documentation

### GET /api/v1/stats/summary

**Description:** Returns aggregate statistics for the authenticated user's focus sessions and trees.

**Authentication:** Required (Bearer token)

**Query Parameters:** None

**Response (200 OK):**
```json
{
  "totalMinutes": 450,
  "treesCompleted": 12,
  "sessions": 18,
  "taskCompletionRate": 0.67
}
```

**Error Responses:**
- 401 UNAUTHORIZED - Missing or invalid authentication token
- 500 INTERNAL_ERROR - Database error

---

### GET /api/v1/stats/streak

**Description:** Returns streak information for the authenticated user.

**Authentication:** Required (Bearer token)

**Query Parameters:** None

**Response (200 OK):**
```json
{
  "currentStreak": 7,
  "longestStreak": 14,
  "lastActiveDate": "2025-03-25"
}
```

**Response (200 OK - No Streak Record):**
```json
{
  "currentStreak": 0,
  "longestStreak": 0,
  "lastActiveDate": null
}
```

**Error Responses:**
- 401 UNAUTHORIZED - Missing or invalid authentication token
- 500 INTERNAL_ERROR - Database error

## Implementation Notes

### Following Existing Patterns

1. **Router Structure** (from `sessions.ts`, `auth.ts`):
   - Import dependencies at top
   - Create router with `Router()`
   - Define Zod schemas before routes
   - Add route handlers with middleware chain
   - Export default router

2. **Service Layer** (from `treeService.ts`):
   - Export interface types
   - Export async functions
   - Use Prisma client from `../lib/prisma`
   - Handle edge cases explicitly

3. **Error Handling** (from `auth.ts`, `sessions.ts`):
   - Use `apiError` helper for all error responses
   - Set appropriate HTTP status codes
   - Provide clear error messages
   - Include error codes from `ErrorCode` enum

4. **Validation** (from `sessions.ts`):
   - Define Zod schemas with `z.object({})`
   - Use `validate(schema)` middleware
   - For endpoints with no query params, use empty schema: `z.object({})`

### Performance Considerations

1. **Query Optimization:**
   - Use Prisma aggregation functions (efficient SQL generation)
   - Use `select` clause to fetch only needed fields
   - Add database indexes on `userId` and `state` (already exist)

2. **Parallel Queries:**
   - Summary stats require 4 separate queries
   - Can be executed in parallel using `Promise.all()`
   - Reduces total response time

3. **Caching (Future Enhancement):**
   - Stats data changes infrequently (only on session completion)
   - Could cache results in Redis with TTL
   - Invalidate cache on session creation
   - Not implemented in v1 (premature optimization)

### Database Indexes

Existing indexes support these queries efficiently:
- `sessions` table: `@@index([userId, state])` - filters by userId and state
- `daily_trees` table: `@@index([userId, date])` - filters by userId
- `streaks` table: `@@unique([userId])` - unique lookup by userId

No new indexes required.

## Future Enhancements

1. **Date Range Filtering:**
   - Add optional `startDate` and `endDate` query params
   - Filter sessions and trees within date range
   - Useful for monthly/yearly statistics

2. **Caching Layer:**
   - Cache stats in Redis with 5-minute TTL
   - Invalidate on session completion
   - Reduces database load for frequently accessed data

3. **Additional Metrics:**
   - Average session duration
   - Most productive time of day
   - Favorite session variant
   - Weekly/monthly trends

4. **Pagination:**
   - Not needed for current endpoints (single aggregate result)
   - Would be needed if adding session history to stats

