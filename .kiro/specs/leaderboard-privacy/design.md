# Design Document: Leaderboard Privacy

## Overview

This feature adds privacy controls to the FocusForest leaderboard system, allowing users to opt out of appearing on the global solo leaderboard. The implementation involves:

1. Adding an `isPrivate` boolean field to the users table (default: false)
2. Creating a new PATCH `/api/v1/auth/profile` endpoint for profile updates including privacy settings
3. Modifying the `updateSoloLeaderboard()` function to respect privacy settings by using `redis.zrem` for private users and `redis.zadd` for public users
4. Updating the GET `/api/v1/leaderboard/solo` endpoint to filter out private users and simplify scope validation to only accept "global" or "none"
5. Immediately updating the leaderboard when a user toggles from private to public
6. Updating API documentation

The design maintains backward compatibility—all existing users default to public visibility, and all other platform features (groups, streaks, tree growth) remain unchanged.

## Architecture

### Database Layer

The privacy preference is stored directly in the `users` table as a boolean field. This approach:
- Keeps user profile data co-located
- Allows efficient querying during midnight cron jobs
- Simplifies the data model (no separate privacy_settings table needed)

### API Layer

A new profile update endpoint follows the existing auth route patterns:
- Uses Zod for request validation
- Supports partial updates (only provided fields are modified)
- Returns the updated user profile
- Requires authentication via the existing `requireAuth` middleware

### Leaderboard Service Layer

The `updateSoloLeaderboard()` function is modified to check the user's `isPrivate` field:
- If `isPrivate === true`: remove user from Redis sorted set via `ZREM`
- If `isPrivate === false`: add/update user in Redis sorted set via `ZADD`

The `getSoloLeaderboard()` function filters results to exclude private users by:
- Fetching user records from Prisma
- Only including users where `isPrivate === false` in the response
- Recalculating rank positions to be consecutive

### Midnight Cron Integration

The existing midnight cron job already calls `updateSoloLeaderboard(userId)` for each user. No changes are needed to the cron logic itself—the privacy filtering happens inside the service function.

## Components and Interfaces

### 1. Database Schema Changes

**Migration: Add isPrivate field to users table**

```prisma
model User {
  id                String             @id @default(uuid())
  email             String             @unique
  name              String
  avatarUrl         String?            @map("avatar_url")
  utcOffset         Int                @default(0) @map("utc_offset")
  isPrivate         Boolean            @default(false) @map("is_private")  // NEW
  createdAt         DateTime           @default(now()) @map("created_at")
  // ... existing relations
}
```

**Migration SQL:**
```sql
ALTER TABLE users ADD COLUMN is_private BOOLEAN NOT NULL DEFAULT false;
```

### 2. Profile Update Endpoint

**Route:** `PATCH /api/v1/auth/profile`

**Request Schema (Zod):**
```typescript
const updateProfileSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().nullable().optional(),
  isPrivate: z.boolean().optional(),
});
```

**Request Example:**
```json
{
  "name": "Alice",
  "isPrivate": true
}
```

**Response (200):**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "Alice",
  "avatarUrl": null,
  "utcOffset": 330,
  "isPrivate": true,
  "createdAt": "2025-03-01T00:00:00.000Z"
}
```

**Error Responses:**
- `400`: Validation error (invalid field types or values)
- `401`: Unauthorized (no valid JWT)
- `404`: User not found

### 3. Leaderboard Service Updates

**Modified Function: `updateSoloLeaderboard(userId: string)`**

```typescript
export async function updateSoloLeaderboard(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPrivate: true },
  });

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  if (user.isPrivate) {
    // Remove from leaderboard
    await redis.zrem(SOLO_KEY, userId);
    return;
  }

  // User is public — add/update their score
  const count = await prisma.dailyTree.count({
    where: { userId, stage: 4 },
  });

  await redis.zadd(SOLO_KEY, { score: count, member: userId });
}
```

**Modified Function: `getSoloLeaderboard(page: number, limit: number, scope: string)`**

```typescript
export async function getSoloLeaderboard(
  page: number,
  limit: number,
  scope: string
): Promise<SoloLeaderboardEntry[]> {
  // Handle "none" scope
  if (scope === "none") {
    return [];
  }

  const start = (page - 1) * limit;
  const end = start + limit - 1;

  const raw = await redis.zrange(SOLO_KEY, start, end, {
    rev: true,
    withScores: true,
  });

  if (!raw || raw.length === 0) return [];

  const entries = raw as { member: string; score: number }[];
  const userIds = entries.map((e) => e.member);

  // Fetch users and filter out private ones
  const users = await prisma.user.findMany({
    where: { 
      id: { in: userIds },
      isPrivate: false  // FILTER PRIVATE USERS
    },
    select: {
      id: true,
      name: true,
      streak: { select: { currentStreak: true } },
    },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  // Only include users that passed the privacy filter
  const filtered = entries
    .filter(entry => userMap.has(entry.member))
    .map((entry, idx) => {
      const user = userMap.get(entry.member)!;
      return {
        rank: start + idx + 1,
        userId: entry.member,
        name: user.name,
        totalTrees: entry.score,
        currentStreak: user.streak?.currentStreak ?? 0,
      };
    });

  return filtered;
}
```

### 4. Leaderboard Route Updates

**Modified Route: `GET /api/v1/leaderboard/solo`**

```typescript
const leaderboardQuerySchema = z.object({
  scope: z.enum(["global", "none"]).default("global"),  // REMOVED "friends"
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get(
  "/solo",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const query = leaderboardQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json(apiError("VALIDATION_ERROR", "Invalid query parameters."));
      return;
    }

    const { scope, page, limit } = query.data;
    const entries = await getSoloLeaderboard(page, limit, scope);
    res.json({ leaderboard: entries, page, limit });
  }
);
```

### 5. Profile Update Route Implementation

**New Route in `src/routes/auth.ts`:**

```typescript
const updateProfileSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().nullable().optional(),
  isPrivate: z.boolean().optional(),
});

router.patch(
  "/profile",
  requireAuth,
  validate(updateProfileSchema),
  async (req: Request, res: Response): Promise<void> => {
    const updates = req.body as z.infer<typeof updateProfileSchema>;
    const userId = req.userId!;

    // Check if isPrivate is being toggled from true to false
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPrivate: true },
    });

    const wasPrivate = currentUser?.isPrivate ?? false;
    const willBePublic = updates.isPrivate === false && wasPrivate;

    // Update user profile
    const user = await prisma.user.update({
      where: { id: userId },
      data: updates,
    });

    // If user is going from private to public, immediately update leaderboard
    if (willBePublic) {
      try {
        await updateSoloLeaderboard(userId);
      } catch (err) {
        console.error(`Failed to update leaderboard for user ${userId}:`, err);
        // Non-fatal — profile update succeeded
      }
    }

    res.status(200).json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      utcOffset: user.utcOffset,
      isPrivate: user.isPrivate,
      createdAt: user.createdAt,
    });
  }
);
```

## Data Models

### User Model (Updated)

```typescript
type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  utcOffset: number;
  isPrivate: boolean;  // NEW FIELD
  createdAt: Date;
};
```

### Profile Update Request

```typescript
type UpdateProfileRequest = {
  name?: string;
  avatarUrl?: string | null;
  isPrivate?: boolean;
};
```

### Solo Leaderboard Entry (Unchanged)

```typescript
type SoloLeaderboardEntry = {
  rank: number;
  userId: string;
  name: string;
  totalTrees: number;
  currentStreak: number;
};
```


## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property Reflection

After analyzing all acceptance criteria, I identified the following redundancies:
- Requirements 3.2 and 3.3 are subsumed by 3.1 (if private users are excluded, ranks are automatically correct and private requesters don't see themselves)
- Requirement 5.2 is redundant with 5.1 (same requirement stated differently)
- Requirement 6.4 is redundant with 6.1 (same requirement)
- Requirements 2.3, 2.4, 2.5 can be combined into a single comprehensive validation property
- Requirements 8.1 and 8.2 can be combined into a single idempotence property
- Requirements 8.3 and 8.4 can be combined into a single property about cron respecting privacy state

### Property 1: Profile validation accepts valid field combinations

For any request body containing a subset of {name, avatarUrl, isPrivate} where name is a string of 1-50 characters, avatarUrl is a string or null, and isPrivate is a boolean, the profile update endpoint should accept the request and return HTTP 200.

**Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.7**

### Property 2: Profile validation rejects invalid inputs

For any request body containing invalid values (name outside 1-50 characters, avatarUrl not a string/null, isPrivate not a boolean, or unknown fields), the profile update endpoint should reject the request with HTTP 400.

**Validates: Requirements 2.8**

### Property 3: Profile updates are partial

For any user and any subset of valid profile fields {name, avatarUrl, isPrivate}, updating only those fields should leave all other user fields unchanged in the database.

**Validates: Requirements 2.6**

### Property 4: Private users are excluded from solo leaderboard

For any leaderboard query with scope=global, all returned entries should have isPrivate=false, and no user with isPrivate=true should appear in the results.

**Validates: Requirements 3.1**

### Property 5: Leaderboard ranks are consecutive

For any solo leaderboard response, the rank values should form a consecutive sequence starting from (page-1)*limit + 1 with no gaps.

**Validates: Requirements 3.4**

### Property 6: Scope validation accepts only global or none

For any leaderboard request, the scope parameter should only accept the values "global" or "none", and any other value should return HTTP 400.

**Validates: Requirements 4.1, 4.4**

### Property 7: Groups leaderboard includes all members

For any group, the total trees count in the groups leaderboard should equal the sum of completed trees (stage=4) from all group members, regardless of their isPrivate setting.

**Validates: Requirements 5.1**

### Property 8: updateSoloLeaderboard respects privacy for private users

For any user with isPrivate=true, calling updateSoloLeaderboard(userId) should result in that userId not being present in the Redis leaderboard:solo sorted set.

**Validates: Requirements 6.2**

### Property 9: updateSoloLeaderboard adds public users

For any user with isPrivate=false, calling updateSoloLeaderboard(userId) should result in that userId being present in the Redis leaderboard:solo sorted set with a score equal to their completed tree count.

**Validates: Requirements 6.3**

### Property 10: Midnight cron respects privacy settings

For any user processed by the midnight cron job, after updateSoloLeaderboard is called, the user should be present in Redis if and only if isPrivate=false.

**Validates: Requirements 6.1**

### Property 11: Privacy toggle is idempotent

For any user and any boolean value b, setting isPrivate to b multiple times in succession should succeed each time without error, and the final state should be isPrivate=b.

**Validates: Requirements 8.1, 8.2**

### Property 12: Private-to-public toggle updates leaderboard immediately

For any user with isPrivate=true, when the profile is updated to set isPrivate=false, the user should appear in the Redis leaderboard:solo sorted set immediately after the update completes (without waiting for midnight cron).

**Validates: Requirements 8.5**

### Property 13: Cron eventually reflects privacy state

For any user who toggles isPrivate, after the next midnight cron run for that user's timezone, the Redis leaderboard state should match their current isPrivate value (present if false, absent if true).

**Validates: Requirements 8.3, 8.4**

## Error Handling

### Profile Update Endpoint Errors

| Error Condition | HTTP Status | Error Code | Message |
|----------------|-------------|------------|---------|
| Invalid field types or values | 400 | VALIDATION_ERROR | "Invalid profile data" |
| Unauthorized (no JWT) | 401 | UNAUTHORIZED | "Authentication required" |
| User not found | 404 | USER_NOT_FOUND | "User not found" |
| Database error | 500 | INTERNAL_ERROR | "Failed to update profile" |

### Leaderboard Endpoint Errors

| Error Condition | HTTP Status | Error Code | Message |
|----------------|-------------|------------|---------|
| Invalid scope value | 400 | VALIDATION_ERROR | "Invalid query parameters" |
| Invalid page/limit | 400 | VALIDATION_ERROR | "Invalid query parameters" |
| Unauthorized (no JWT) | 401 | UNAUTHORIZED | "Authentication required" |
| Redis unavailable | 500 | INTERNAL_ERROR | "Leaderboard temporarily unavailable" |

### Graceful Degradation

- If Redis is unavailable during profile update, the profile update should still succeed, but the immediate leaderboard update will be skipped (it will be corrected at the next midnight cron)
- If Redis is unavailable during leaderboard fetch, return HTTP 500 with a clear error message
- If a user is not found during `updateSoloLeaderboard`, log the error but don't crash the midnight cron (continue processing other users)

## Testing Strategy

### Unit Testing

Unit tests should focus on specific examples and edge cases:

1. **Profile Update Examples**
   - Update only name
   - Update only avatarUrl
   - Update only isPrivate
   - Update all fields at once
   - Update with null avatarUrl

2. **Edge Cases**
   - Name at boundary (1 char, 50 chars)
   - Empty request body (no fields to update)
   - User not found scenario
   - Concurrent profile updates

3. **Leaderboard Filtering Examples**
   - Leaderboard with all public users
   - Leaderboard with all private users (should return empty)
   - Leaderboard with mixed public/private users
   - scope=none returns empty array
   - Invalid scope returns 400

4. **Privacy Toggle Scenarios**
   - Toggle from false to true
   - Toggle from true to false
   - Toggle to same value (idempotence)
   - Verify immediate leaderboard update on private→public

5. **Integration Tests**
   - Full flow: create user → submit sessions → verify leaderboard → toggle private → verify removal → toggle public → verify restoration
   - Midnight cron with mixed privacy settings

### Property-Based Testing

Property tests should verify universal behaviors across all inputs. Each test should run a minimum of 100 iterations.

**Testing Library:** Use `fast-check` for TypeScript/Node.js property-based testing.

**Test Configuration:**
```typescript
import fc from 'fast-check';

// Example property test structure
fc.assert(
  fc.property(
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }),
      avatarUrl: fc.oneof(fc.string(), fc.constant(null)),
      isPrivate: fc.boolean(),
    }),
    async (profileData) => {
      // Test implementation
    }
  ),
  { numRuns: 100 }
);
```

**Property Test Suite:**

1. **Property 1: Profile validation accepts valid field combinations**
   - Tag: `Feature: leaderboard-privacy, Property 1: Profile validation accepts valid field combinations`
   - Generator: Random subsets of {name: string(1-50), avatarUrl: string|null, isPrivate: boolean}
   - Assertion: All requests return 200

2. **Property 2: Profile validation rejects invalid inputs**
   - Tag: `Feature: leaderboard-privacy, Property 2: Profile validation rejects invalid inputs`
   - Generator: Invalid values (name length violations, wrong types, unknown fields)
   - Assertion: All requests return 400

3. **Property 3: Profile updates are partial**
   - Tag: `Feature: leaderboard-privacy, Property 3: Profile updates are partial`
   - Generator: Random user state + random subset of fields to update
   - Assertion: Only updated fields change, others remain unchanged

4. **Property 4: Private users are excluded from solo leaderboard**
   - Tag: `Feature: leaderboard-privacy, Property 4: Private users are excluded from solo leaderboard`
   - Generator: Random mix of public/private users with scores
   - Assertion: No private users in results

5. **Property 5: Leaderboard ranks are consecutive**
   - Tag: `Feature: leaderboard-privacy, Property 5: Leaderboard ranks are consecutive`
   - Generator: Random leaderboard state, random page/limit
   - Assertion: Ranks form sequence (page-1)*limit + 1, +2, +3...

6. **Property 6: Scope validation accepts only global or none**
   - Tag: `Feature: leaderboard-privacy, Property 6: Scope validation accepts only global or none`
   - Generator: Random strings including valid and invalid scope values
   - Assertion: Only "global" and "none" return 200, others return 400

7. **Property 7: Groups leaderboard includes all members**
   - Tag: `Feature: leaderboard-privacy, Property 7: Groups leaderboard includes all members`
   - Generator: Random group with random members (mixed privacy settings)
   - Assertion: Group score = sum of all member trees regardless of isPrivate

8. **Property 8: updateSoloLeaderboard respects privacy for private users**
   - Tag: `Feature: leaderboard-privacy, Property 8: updateSoloLeaderboard respects privacy for private users`
   - Generator: Random users with isPrivate=true
   - Assertion: After update, userId not in Redis

9. **Property 9: updateSoloLeaderboard adds public users**
   - Tag: `Feature: leaderboard-privacy, Property 9: updateSoloLeaderboard adds public users`
   - Generator: Random users with isPrivate=false and random tree counts
   - Assertion: After update, userId in Redis with correct score

10. **Property 10: Midnight cron respects privacy settings**
    - Tag: `Feature: leaderboard-privacy, Property 10: Midnight cron respects privacy settings`
    - Generator: Random users with random privacy settings
    - Assertion: After cron, Redis state matches isPrivate (present iff false)

11. **Property 11: Privacy toggle is idempotent**
    - Tag: `Feature: leaderboard-privacy, Property 11: Privacy toggle is idempotent`
    - Generator: Random boolean value, random number of repetitions (1-10)
    - Assertion: All updates succeed, final state matches target value

12. **Property 12: Private-to-public toggle updates leaderboard immediately**
    - Tag: `Feature: leaderboard-privacy, Property 12: Private-to-public toggle updates leaderboard immediately`
    - Generator: Random users starting with isPrivate=true
    - Assertion: After toggle to false, user immediately in Redis

13. **Property 13: Cron eventually reflects privacy state**
    - Tag: `Feature: leaderboard-privacy, Property 13: Cron eventually reflects privacy state`
    - Generator: Random users with random privacy toggles
    - Assertion: After cron run, Redis matches current isPrivate value

### Test Data Generators

For property-based tests, use these generators:

```typescript
// User generator
const userArb = fc.record({
  id: fc.uuid(),
  email: fc.emailAddress(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  avatarUrl: fc.oneof(fc.webUrl(), fc.constant(null)),
  utcOffset: fc.integer({ min: -720, max: 840 }),
  isPrivate: fc.boolean(),
});

// Profile update generator (partial)
const profileUpdateArb = fc.record({
  name: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
  avatarUrl: fc.option(fc.oneof(fc.string(), fc.constant(null))),
  isPrivate: fc.option(fc.boolean()),
}, { requiredKeys: [] });

// Invalid profile update generator
const invalidProfileUpdateArb = fc.oneof(
  fc.record({ name: fc.string({ maxLength: 0 }) }), // too short
  fc.record({ name: fc.string({ minLength: 51 }) }), // too long
  fc.record({ isPrivate: fc.string() }), // wrong type
  fc.record({ unknownField: fc.anything() }), // unknown field
);

// Leaderboard state generator
const leaderboardStateArb = fc.array(
  fc.record({
    userId: fc.uuid(),
    isPrivate: fc.boolean(),
    treeCount: fc.integer({ min: 0, max: 1000 }),
  }),
  { minLength: 0, maxLength: 100 }
);
```

### Testing Checklist

- [ ] All 13 properties have corresponding property-based tests
- [ ] Each property test runs minimum 100 iterations
- [ ] All property tests are tagged with feature name and property text
- [ ] Unit tests cover specific examples and edge cases
- [ ] Integration test covers full user journey with privacy toggles
- [ ] Error handling is tested for all failure modes
- [ ] Backward compatibility is verified (existing users default to public)
- [ ] Groups leaderboard is unaffected by privacy settings
- [ ] Midnight cron handles privacy correctly
- [ ] Immediate leaderboard update on private→public toggle is verified

