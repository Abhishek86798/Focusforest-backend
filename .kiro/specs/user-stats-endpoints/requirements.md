# Requirements Document

## Introduction

This feature adds two new authenticated API endpoints to the FocusForest backend that provide user statistics for the dashboard screen. The endpoints aggregate data from the sessions, daily_trees, and streaks tables to display summary metrics and streak information.

## Glossary

- **Stats_API**: The new `/api/v1/stats` router module
- **Summary_Endpoint**: The `GET /api/v1/stats/summary` route handler
- **Streak_Endpoint**: The `GET /api/v1/stats/streak` route handler
- **Stats_Service**: The service layer module that performs database aggregations
- **Completed_Session**: A session record where `state = 'completed'`
- **Completed_Tree**: A daily_trees record where `stage = 4`
- **Task_Completion_Rate**: The ratio of completed sessions with `task_status = 'completed'` to total completed sessions

## Requirements

### Requirement 1: Summary Statistics Endpoint

**User Story:** As a user, I want to view my overall focus statistics on the dashboard, so that I can track my progress and productivity.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/v1/stats/summary`, THE Stats_API SHALL require authentication via the requireAuth middleware
2. WHEN an authenticated user requests summary statistics, THE Stats_Service SHALL compute totalMinutes as the sum of focus_minutes from all completed sessions for that user
3. WHEN an authenticated user requests summary statistics, THE Stats_Service SHALL compute treesCompleted as the count of daily_trees records where stage equals 4 for that user
4. WHEN an authenticated user requests summary statistics, THE Stats_Service SHALL compute sessions as the count of all completed sessions for that user
5. WHEN an authenticated user requests summary statistics, THE Stats_Service SHALL compute taskCompletionRate as the ratio of completed sessions with task_status equals 'completed' to total completed sessions
6. IF the user has zero completed sessions, THEN THE Stats_Service SHALL return taskCompletionRate as 0
7. THE Summary_Endpoint SHALL return a JSON response with fields totalMinutes, treesCompleted, sessions, and taskCompletionRate
8. THE Summary_Endpoint SHALL return HTTP status 200 for successful requests
9. IF the user is not authenticated, THEN THE Stats_API SHALL return HTTP status 401 with error code UNAUTHORIZED

### Requirement 2: Streak Statistics Endpoint

**User Story:** As a user, I want to view my streak information on the dashboard, so that I can see my consistency and motivation.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/v1/stats/streak`, THE Stats_API SHALL require authentication via the requireAuth middleware
2. WHEN an authenticated user requests streak statistics, THE Stats_Service SHALL query the streaks table for that user's record
3. IF a streak record exists for the user, THEN THE Stats_Service SHALL return currentStreak, longestStreak, and lastActiveDate from that record
4. IF no streak record exists for the user, THEN THE Stats_Service SHALL return currentStreak as 0, longestStreak as 0, and lastActiveDate as null
5. THE Streak_Endpoint SHALL format lastActiveDate as YYYY-MM-DD when returning the response
6. THE Streak_Endpoint SHALL return a JSON response with fields currentStreak, longestStreak, and lastActiveDate
7. THE Streak_Endpoint SHALL return HTTP status 200 for successful requests
8. IF the user is not authenticated, THEN THE Stats_API SHALL return HTTP status 401 with error code UNAUTHORIZED

### Requirement 3: Router Integration

**User Story:** As a developer, I want the stats endpoints mounted at the correct API path, so that they follow the existing API versioning convention.

#### Acceptance Criteria

1. THE Stats_API SHALL be mounted in src/index.ts at the path `/api/v1/stats`
2. THE Stats_API SHALL be created as a new Express Router in src/routes/stats.ts
3. THE Stats_Service SHALL be created as a new service module in src/services/statsService.ts
4. THE Stats_API SHALL use the existing validate middleware pattern for query parameter validation
5. THE Stats_API SHALL use the existing apiError helper for error responses

### Requirement 4: Data Validation and Error Handling

**User Story:** As a developer, I want consistent validation and error handling, so that the API behaves predictably.

#### Acceptance Criteria

1. THE Summary_Endpoint SHALL use Zod to validate query parameters (empty schema for these endpoints)
2. THE Streak_Endpoint SHALL use Zod to validate query parameters (empty schema for these endpoints)
3. IF a database error occurs, THEN THE Stats_Service SHALL propagate the error to the route handler
4. THE Stats_API SHALL use the standard error envelope format from src/lib/apiError.ts
5. THE Stats_API SHALL include request/response documentation in comments at the top of the route file following the Postman collection pattern

### Requirement 5: Database Query Optimization

**User Story:** As a developer, I want efficient database queries, so that the stats endpoints respond quickly.

#### Acceptance Criteria

1. THE Stats_Service SHALL use Prisma aggregation functions (count, sum) for computing statistics
2. THE Stats_Service SHALL NOT use raw SQL queries
3. THE Stats_Service SHALL filter sessions by state equals 'completed' in all aggregation queries
4. THE Stats_Service SHALL use a single database query per statistic where possible
5. THE Stats_Service SHALL use Prisma's select clause to retrieve only required fields from the streaks table
