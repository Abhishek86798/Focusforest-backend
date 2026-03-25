# Implementation Plan: Leaderboard Privacy

## Overview

This feature adds privacy controls to the FocusForest leaderboard system. Users can opt out of appearing on the global solo leaderboard while maintaining full access to all other platform features. The implementation follows this order:

1. Add `isPrivate` boolean field to users table via Prisma migration
2. Create PATCH `/api/v1/auth/profile` endpoint with Zod validation
3. Modify `updateSoloLeaderboard()` to check `isPrivate` and use `ZREM` for private users
4. Update GET `/api/v1/leaderboard/solo` to filter private users and accept only `scope=global|none`
5. Implement immediate leaderboard update when toggling from private to public
6. Update API documentation

## Tasks

- [x] 1. Add isPrivate field to users table
  - [x] 1.1 Create Prisma migration for isPrivate field
    - Add `isPrivate Boolean @default(false) @map("is_private")` to User model in `prisma/schema.prisma`
    - Run `npx prisma migrate dev --name add_is_private_to_users`
    - Verify migration creates `is_private` column with default false
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [ ]* 1.2 Write property test for default isPrivate value
    - **Property 1: Profile validation accepts valid field combinations**
    - **Validates: Requirements 1.3**

- [x] 2. Implement PATCH /api/v1/auth/profile endpoint
  - [x] 2.1 Create profile update schema and route handler
    - Add Zod schema: `z.object({ name: z.string().min(1).max(50).optional(), avatarUrl: z.string().nullable().optional(), isPrivate: z.boolean().optional() })`
    - Add PATCH `/profile` route in `src/routes/auth.ts` with `requireAuth` and `validate` middleware
    - Implement partial update logic using `prisma.user.update()` with only provided fields
    - Check if user is toggling from private to public (fetch current `isPrivate`, compare with update)
    - If toggling to public, call `updateSoloLeaderboard(userId)` immediately after update
    - Return updated user profile with all fields including `isPrivate`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 8.5_
  
  - [ ]* 2.2 Write property tests for profile validation
    - **Property 1: Profile validation accepts valid field combinations**
    - **Property 2: Profile validation rejects invalid inputs**
    - **Property 3: Profile updates are partial**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**
  
  - [ ]* 2.3 Write unit tests for profile endpoint
    - Test updating only name
    - Test updating only avatarUrl
    - Test updating only isPrivate
    - Test updating all fields at once
    - Test validation errors (name too short/long, wrong types)
    - Test immediate leaderboard update on private→public toggle
    - _Requirements: 2.1, 2.2, 2.6, 2.7, 2.8, 8.5_

- [x] 3. Modify updateSoloLeaderboard to respect privacy
  - [x] 3.1 Update updateSoloLeaderboard function in leaderboardService.ts
    - Fetch user's `isPrivate` field using `prisma.user.findUnique()`
    - If `isPrivate === true`, call `redis.zrem(SOLO_KEY, userId)` and return early
    - If `isPrivate === false`, proceed with existing logic: count completed trees and call `redis.zadd()`
    - Handle user not found case (throw error or log warning)
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [ ]* 3.2 Write property tests for updateSoloLeaderboard privacy logic
    - **Property 8: updateSoloLeaderboard respects privacy for private users**
    - **Property 9: updateSoloLeaderboard adds public users**
    - **Property 10: Midnight cron respects privacy settings**
    - **Validates: Requirements 6.1, 6.2, 6.3**
  
  - [ ]* 3.3 Write unit tests for updateSoloLeaderboard
    - Test private user is removed from Redis
    - Test public user is added/updated in Redis with correct score
    - Test user not found scenario
    - Test user with zero completed trees
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 4. Checkpoint - Verify TypeScript compilation and test privacy logic
  - Run `npx tsc --noEmit` to verify no TypeScript errors
  - Ensure all tests pass, ask the user if questions arise

- [x] 5. Update GET /api/v1/leaderboard/solo endpoint
  - [x] 5.1 Modify scope validation and getSoloLeaderboard function
    - In `src/routes/leaderboard.ts`, change `leaderboardQuerySchema` scope enum to `z.enum(["global", "none"])`
    - In `src/services/leaderboardService.ts`, update `getSoloLeaderboard()` to accept `scope` parameter
    - If `scope === "none"`, return empty array immediately
    - Add `isPrivate: false` filter to `prisma.user.findMany()` query
    - Recalculate ranks to be consecutive (already handled by existing map logic)
    - Pass `scope` parameter from route handler to service function
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4_
  
  - [ ]* 5.2 Write property tests for leaderboard filtering
    - **Property 4: Private users are excluded from solo leaderboard**
    - **Property 5: Leaderboard ranks are consecutive**
    - **Property 6: Scope validation accepts only global or none**
    - **Validates: Requirements 3.1, 3.4, 4.1, 4.4**
  
  - [ ]* 5.3 Write unit tests for leaderboard endpoint
    - Test scope=global returns filtered leaderboard
    - Test scope=none returns empty array
    - Test invalid scope returns 400 error
    - Test leaderboard with all public users
    - Test leaderboard with all private users (returns empty)
    - Test leaderboard with mixed public/private users
    - Test rank recalculation is consecutive
    - _Requirements: 3.1, 3.4, 4.1, 4.2, 4.3, 4.4_

- [x] 6. Verify groups leaderboard remains unchanged
  - [x] 6.1 Confirm groups leaderboard logic is unaffected
    - Review `updateGroupsLeaderboard()` in `src/services/leaderboardService.ts`
    - Verify it counts all completed trees regardless of `isPrivate` (no changes needed)
    - Verify `getGroupsLeaderboard()` has no privacy filtering (no changes needed)
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [ ]* 6.2 Write property test for groups leaderboard
    - **Property 7: Groups leaderboard includes all members**
    - **Validates: Requirements 5.1**

- [ ] 7. Update API documentation
  - [x] 7.1 Document new profile endpoint and leaderboard changes
    - Add PATCH `/api/v1/auth/profile` endpoint to `docs/API.md`
    - Document request schema: `{ name?, avatarUrl?, isPrivate? }`
    - Document response includes `isPrivate` field
    - Update GET `/api/v1/leaderboard/solo` documentation to remove `friends` scope
    - Document that scope accepts only `global` or `none`
    - Add note that private users are excluded from global leaderboard
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 8. Final checkpoint - End-to-end testing
  - Run `npx tsc --noEmit` to verify no TypeScript errors
  - Test complete flow with Postman:
    - Create user → submit sessions → verify on leaderboard
    - Toggle isPrivate to true → verify removed from leaderboard
    - Toggle isPrivate to false → verify immediately restored to leaderboard
    - Verify groups leaderboard still includes private users' trees
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation with TypeScript compilation checks
- Property tests validate universal correctness properties across all inputs
- Unit tests validate specific examples and edge cases
- The midnight cron job automatically respects privacy settings through the modified `updateSoloLeaderboard()` function
- No changes needed to sessions, trees, groups, or streak logic (backward compatibility maintained)
