# Requirements Document

## Introduction

This feature adds privacy controls to the FocusForest leaderboard system, allowing users to opt out of appearing on the global solo leaderboard while maintaining full access to all other platform features. Users can toggle their privacy setting through a new profile update endpoint.

## Glossary

- **User**: An authenticated FocusForest account holder
- **Privacy_System**: The backend service managing user privacy preferences
- **Profile_Service**: The backend service handling user profile updates
- **Leaderboard_Service**: The backend service managing solo and group leaderboards
- **Global_Leaderboard**: The public ranking of all users by completed trees
- **Private_User**: A user who has set isPrivate to true
- **Public_User**: A user who has set isPrivate to false (default)
- **Groups_Leaderboard**: The ranking of groups by collective completed trees

## Requirements

### Requirement 1: Privacy Field Storage

**User Story:** As a developer, I want to store user privacy preferences in the database, so that the system can respect user choices across sessions.

#### Acceptance Criteria

1. THE Privacy_System SHALL store an isPrivate boolean field in the users table with a default value of false
2. THE Privacy_System SHALL persist the isPrivate value across user sessions
3. WHEN a new user account is created, THE Privacy_System SHALL initialize isPrivate to false

### Requirement 2: Profile Update Endpoint

**User Story:** As a user, I want to update my profile settings including privacy preferences, so that I can control my public visibility.

#### Acceptance Criteria

1. THE Profile_Service SHALL accept PATCH requests at /api/v1/auth/profile
2. WHEN a PATCH request is received, THE Profile_Service SHALL validate the request body contains optional fields: name, avatarUrl, and isPrivate
3. WHEN the request body contains a name field, THE Profile_Service SHALL validate it is a string between 1 and 50 characters
4. WHEN the request body contains an avatarUrl field, THE Profile_Service SHALL validate it is a string or null
5. WHEN the request body contains an isPrivate field, THE Profile_Service SHALL validate it is a boolean
6. WHEN validation succeeds, THE Profile_Service SHALL update only the provided fields in the users table
7. WHEN the update succeeds, THE Profile_Service SHALL return the updated user profile with HTTP status 200
8. IF validation fails, THEN THE Profile_Service SHALL return an error response with HTTP status 400

### Requirement 3: Global Leaderboard Privacy Filtering

**User Story:** As a private user, I want to be excluded from the global leaderboard, so that my progress remains private.

#### Acceptance Criteria

1. WHEN the Leaderboard_Service receives a request for GET /api/v1/leaderboard/solo with scope=global, THE Leaderboard_Service SHALL exclude all users where isPrivate is true
2. WHEN the Leaderboard_Service computes rankings, THE Leaderboard_Service SHALL assign rank positions only to Public_Users
3. WHEN a Private_User requests the global leaderboard, THE Leaderboard_Service SHALL return the leaderboard without including the requesting user
4. THE Leaderboard_Service SHALL recalculate rank positions to be consecutive integers starting from 1

### Requirement 4: Leaderboard Scope Simplification

**User Story:** As a developer, I want to remove unsupported leaderboard scopes, so that the API accurately reflects implemented functionality.

#### Acceptance Criteria

1. THE Leaderboard_Service SHALL accept only the values "global" or "none" for the scope query parameter
2. WHEN scope is set to "global", THE Leaderboard_Service SHALL return the filtered global leaderboard
3. WHEN scope is set to "none", THE Leaderboard_Service SHALL return an empty leaderboard array
4. IF an invalid scope value is provided, THEN THE Leaderboard_Service SHALL return an error response with HTTP status 400

### Requirement 5: Groups Leaderboard Unchanged

**User Story:** As a group member, I want the groups leaderboard to remain unaffected by privacy settings, so that collaborative group progress is always visible.

#### Acceptance Criteria

1. THE Leaderboard_Service SHALL include all group members in groups leaderboard calculations regardless of isPrivate value
2. WHEN computing group forest totals, THE Leaderboard_Service SHALL count completed trees from both Private_Users and Public_Users
3. THE Leaderboard_Service SHALL maintain existing groups leaderboard behavior without modification

### Requirement 6: Midnight Cron Privacy Handling

**User Story:** As a developer, I want the midnight cron job to respect privacy settings, so that private users are not added to the global leaderboard.

#### Acceptance Criteria

1. WHEN the midnight cron job updates the solo leaderboard, THE Privacy_System SHALL check the user's isPrivate field
2. WHEN a user's isPrivate field is true, THE Privacy_System SHALL remove the user from the Redis leaderboard:solo sorted set
3. WHEN a user's isPrivate field is false, THE Privacy_System SHALL add or update the user in the Redis leaderboard:solo sorted set
4. THE Privacy_System SHALL apply privacy filtering during every midnight leaderboard update

### Requirement 7: API Documentation Updates

**User Story:** As an API consumer, I want accurate documentation of the privacy feature, so that I can integrate it correctly.

#### Acceptance Criteria

1. THE Profile_Service SHALL document the PATCH /api/v1/auth/profile endpoint in docs/API.md
2. THE Leaderboard_Service SHALL update the GET /api/v1/leaderboard/solo documentation to reflect the removal of the friends scope
3. THE Leaderboard_Service SHALL document that scope accepts only "global" or "none" values
4. THE Profile_Service SHALL document the isPrivate field in the user profile response schema

### Requirement 8: Privacy Toggle Idempotence

**User Story:** As a user, I want to toggle my privacy setting multiple times, so that I can change my mind without side effects.

#### Acceptance Criteria

1. WHEN a user sets isPrivate to true multiple times, THE Profile_Service SHALL accept each request without error
2. WHEN a user sets isPrivate to false multiple times, THE Profile_Service SHALL accept each request without error
3. WHEN a user toggles isPrivate from true to false, THE Privacy_System SHALL ensure the user appears on the global leaderboard after the next midnight update
4. WHEN a user toggles isPrivate from false to true, THE Privacy_System SHALL ensure the user is removed from the global leaderboard after the next midnight update
5. WHEN a user toggles isPrivate from true to false, THE Profile_Service SHALL immediately call updateSoloLeaderboard(userId) to restore their position without waiting for midnight

### Requirement 9: Backward Compatibility

**User Story:** As a developer, I want existing functionality to remain unchanged, so that current users experience no disruptions.

#### Acceptance Criteria

1. THE Privacy_System SHALL maintain all existing authentication endpoints without modification
2. THE Privacy_System SHALL maintain all existing session submission logic without modification
3. THE Privacy_System SHALL maintain all existing tree growth mechanics without modification
4. THE Privacy_System SHALL maintain all existing group functionality without modification
5. WHEN a user has not explicitly set isPrivate, THE Privacy_System SHALL treat the user as a Public_User
