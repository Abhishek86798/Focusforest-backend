# Tasks: User Stats Endpoints

## Phase 1: Service Layer Implementation

### Task 1.1: Create statsService.ts
- [ ] Create `src/services/statsService.ts` file
- [ ] Import Prisma client from `../lib/prisma`
- [ ] Define `SummaryStats` interface with fields: totalMinutes, treesCompleted, sessions, taskCompletionRate
- [ ] Define `StreakStats` interface with fields: currentStreak, longestStreak, lastActiveDate

### Task 1.2: Implement getSummaryStats function
- [ ] Create async function `getSummaryStats(userId: string): Promise<SummaryStats>`
- [ ] Query total minutes using `prisma.session.aggregate` with `_sum.focusMinutes`
- [ ] Filter by `userId` and `state: 'completed'`
- [ ] Query trees completed using `prisma.dailyTree.count` with `stage: 4`
- [ ] Query total sessions using `prisma.session.count` with `state: 'completed'`
- [ ] Query completed tasks using `prisma.session.count` with `state: 'completed'` and `taskStatus: 'completed'`
- [ ] Calculate taskCompletionRate as `tasksCompleted / totalSessions` (return 0 if totalSessions is 0)
- [ ] Return SummaryStats object with all computed values

### Task 1.3: Implement getStreakStats function
- [ ] Create async function `getStreakStats(userId: string): Promise<StreakStats>`
- [ ] Query streak record using `prisma.streak.findUnique` with `where: { userId }`
- [ ] Use `select` clause to fetch only: currentStreak, longestStreak, lastActiveDate
- [ ] If streak record exists, format lastActiveDate as YYYY-MM-DD string
- [ ] If no streak record, return default values: currentStreak: 0, longestStreak: 0, lastActiveDate: null
- [ ] Return StreakStats object

## Phase 2: Route Handler Implementation

### Task 2.1: Create stats router file
- [ ] Create `src/routes/stats.ts` file
- [ ] Import Router, Request, Response from express
- [ ] Import z from zod
- [ ] Import requireAuth from `../middleware/auth`
- [ ] Import validate from `../middleware/validate`
- [ ] Import apiError from `../lib/apiError`
- [ ] Import getSummaryStats and getStreakStats from `../services/statsService`
- [ ] Create router instance with `Router()`

### Task 2.2: Implement GET /summary endpoint
- [ ] Define empty Zod schema: `const summaryQuerySchema = z.object({})`
- [ ] Create route handler for `GET /` (will be mounted at /api/v1/stats)
- [ ] Add requireAuth middleware
- [ ] Add validate(summaryQuerySchema) middleware
- [ ] In handler, call `getSummaryStats(req.userId)`
- [ ] Wrap in try-catch block
- [ ] On success, return 200 with stats object
- [ ] On error, return 500 with apiError("INTERNAL_ERROR", "Failed to fetch statistics. Please try again.")

### Task 2.3: Implement GET /streak endpoint
- [ ] Define empty Zod schema: `const streakQuerySchema = z.object({})`
- [ ] Create route handler for `GET /streak`
- [ ] Add requireAuth middleware
- [ ] Add validate(streakQuerySchema) middleware
- [ ] In handler, call `getStreakStats(req.userId)`
- [ ] Wrap in try-catch block
- [ ] On success, return 200 with streak object
- [ ] On error, return 500 with apiError("INTERNAL_ERROR", "Failed to fetch streak data. Please try again.")

### Task 2.4: Add route documentation comments
- [ ] Add JSDoc-style comments at top of file describing the endpoints
- [ ] Document request/response format for GET /summary
- [ ] Document request/response format for GET /streak
- [ ] Include example responses in comments

### Task 2.5: Export router
- [ ] Add `export default router` at end of file

## Phase 3: Integration

### Task 3.1: Mount stats router in main app
- [ ] Open `src/index.ts`
- [ ] Import stats router: `import statsRouter from "./routes/stats"`
- [ ] Mount router at `/api/v1/stats`: `app.use("/api/v1/stats", statsRouter)`
- [ ] Place import and mount in alphabetical order with other routers

## Phase 4: Testing

### Task 4.1: Manual testing with Postman
- [ ] Start the development server
- [ ] Create or use existing test user account
- [ ] Get authentication token via POST /api/v1/auth/login
- [ ] Test GET /api/v1/stats/summary with Bearer token
- [ ] Verify response contains: totalMinutes, treesCompleted, sessions, taskCompletionRate
- [ ] Test GET /api/v1/stats/streak with Bearer token
- [ ] Verify response contains: currentStreak, longestStreak, lastActiveDate
- [ ] Test both endpoints without authentication token (should return 401)
- [ ] Test with user who has no sessions (should return zeros)
- [ ] Test with user who has no streak record (should return zeros and null)

### Task 4.2: Verify data accuracy
- [ ] Create test sessions via POST /api/v1/sessions
- [ ] Record expected values (total minutes, session count, task completion count)
- [ ] Call GET /api/v1/stats/summary
- [ ] Verify returned values match expected calculations
- [ ] Verify taskCompletionRate is calculated correctly (completed / total)

### Task 4.3: Test edge cases
- [ ] Test with user who has only abandoned sessions (stats should be zero)
- [ ] Test with user who has sessions but no completed tasks (taskCompletionRate should be 0)
- [ ] Test with new user account (all stats should be zero/null)
- [ ] Verify date formatting for lastActiveDate (YYYY-MM-DD)

## Phase 5: Documentation

### Task 5.1: Update API documentation
- [ ] Open `docs/API.md`
- [ ] Add section for "Stats Endpoints"
- [ ] Document GET /api/v1/stats/summary with request/response examples
- [ ] Document GET /api/v1/stats/streak with request/response examples
- [ ] Include authentication requirements
- [ ] Include error response examples

### Task 5.2: Create Postman collection entries
- [ ] Add "Stats" folder to FocusForest Postman collection
- [ ] Add GET /api/v1/stats/summary request
- [ ] Add GET /api/v1/stats/streak request
- [ ] Configure Bearer token authentication for both requests
- [ ] Add test assertions to verify response structure
- [ ] Export updated collection to `docs/FocusForest.postman_collection.json`

## Completion Criteria

- [ ] Both endpoints return correct data for authenticated users
- [ ] Authentication is enforced (401 for unauthenticated requests)
- [ ] Edge cases handled gracefully (zero sessions, missing streak)
- [ ] Task completion rate calculated correctly (0 when no sessions)
- [ ] Date formatting is correct (YYYY-MM-DD)
- [ ] Code follows existing patterns from auth.ts and sessions.ts
- [ ] No TypeScript errors or warnings
- [ ] Manual testing passes all scenarios
- [ ] API documentation updated
- [ ] Postman collection updated

