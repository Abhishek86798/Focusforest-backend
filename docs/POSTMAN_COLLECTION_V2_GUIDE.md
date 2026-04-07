# FocusForest Postman Collection v2 — Import Guide

**File:** `docs/FocusForest_Complete_v2.postman_collection.json`  
**Date:** 2026-04-07  
**Status:** Complete with all new endpoints

---

## What's Included

This collection includes ALL FocusForest backend endpoints organized into 8 folders:

### 1. Health Check
- GET /health

### 2. Auth (4 endpoints)
- POST /auth/signup
- POST /auth/login
- GET /auth/me
- PATCH /auth/profile (NEW — privacy settings)

### 3. Sessions (3 endpoints)
- POST /sessions — Instant submission
- POST /sessions/start — Immersive mode (NEW)
- GET /sessions — History

### 4. Stats (2 endpoints — NEW)
- GET /stats/summary
- GET /stats/streak

### 5. Timer & Preferences (3 endpoints — NEW)
- GET /timer/variants
- GET /user/preferences
- PATCH /user/preferences

### 6. Groups (7 endpoints)
- POST /groups — Create
- GET /groups — List user's groups (NEW)
- GET /groups/:id — Details
- GET /groups/:id/stats (NEW)
- GET /groups/:id/members/status (NEW)
- GET /groups/:id/calendar
- POST /groups/join

### 7. Trees & Calendar (2 endpoints)
- GET /trees/today
- GET /trees/calendar

### 8. Leaderboard (2 endpoints)
- GET /leaderboard/solo
- GET /leaderboard/groups

---

## How to Import

### Option 1: Import in Postman Desktop/Web

1. Open Postman
2. Click **Import** button (top left)
3. Select **File** tab
4. Click **Choose Files**
5. Navigate to: `D:\SEM 6\HCI\FocusForest\docs\FocusForest_Complete_v2.postman_collection.json`
6. Click **Import**

### Option 2: Drag and Drop

1. Open Postman
2. Drag the file `FocusForest_Complete_v2.postman_collection.json` into Postman window
3. Collection will be imported automatically

---

## Collection Variables

The collection uses these variables (auto-set by requests):

| Variable | Description | Set By |
|----------|-------------|--------|
| `baseUrl` | Server URL (default: http://localhost:3000) | Manual |
| `jwt` | Authentication token | Signup/Login |
| `userId` | Current user ID | Signup/Login |
| `groupId` | Created group ID | Create Group |
| `inviteCode` | Group invite code | Create Group |
| `activeSessionId` | Active session ID | Start Session |

---

## Before Running

### 1. Start Dev Server
```bash
npm run dev
```

### 2. Verify Server is Running
Run the **Health Check** folder first:
- GET /health should return `{ status: "ok" }`

### 3. Set Base URL (if needed)
If your server is not on `localhost:3000`:
1. Click on collection name
2. Go to **Variables** tab
3. Update `baseUrl` value
4. Click **Save**

---

## Running the Collection

### Recommended Order

Run folders in this order for best results:

1. **Health Check** — Verify server is up
2. **Auth** — Run Signup OR Login to get JWT token
3. **Sessions** — Submit some sessions to generate data
4. **Stats** — View your statistics
5. **Timer & Preferences** — Test timer variants and preferences
6. **Groups** — Create and test group features
7. **Trees & Calendar** — View your tree progress
8. **Leaderboard** — Check rankings

### Run Entire Collection

1. Click on collection name
2. Click **Run** button
3. Select all folders
4. Click **Run FocusForest Backend — Complete v2**
5. View results

### Run Individual Folder

1. Hover over folder name
2. Click **...** (three dots)
3. Click **Run folder**
4. View results

### Run Single Request

1. Click on request name
2. Click **Send** button
3. View response

---

## Test Scripts

Each request includes test scripts that automatically:
- Verify response status codes
- Check response structure
- Validate field types
- Save variables for subsequent requests

### View Test Results

After running a request:
1. Click **Test Results** tab (below response)
2. Green checkmarks = passed tests
3. Red X = failed tests

---

## Common Issues

### Issue: 401 Unauthorized

**Cause:** JWT token not set or expired

**Fix:**
1. Run **POST /auth/login** request
2. JWT will be auto-saved to `{{jwt}}` variable
3. Retry the failed request

### Issue: 404 Group Not Found

**Cause:** `{{groupId}}` variable not set

**Fix:**
1. Run **POST /groups** request first
2. Group ID will be auto-saved
3. Retry the failed request

### Issue: Connection Refused

**Cause:** Dev server not running

**Fix:**
```bash
npm run dev
```

### Issue: 409 Email Already Taken

**Cause:** Test user already exists (from previous run)

**Fix:**
1. This is expected behavior
2. Run **POST /auth/login** instead
3. JWT will be set correctly

---

## New Endpoints Highlights

### Stats Endpoints
```
GET /api/v1/stats/summary
GET /api/v1/stats/streak
```
Returns aggregate statistics for the user.

### Timer & Preferences
```
GET /api/v1/timer/variants
GET /api/v1/user/preferences
PATCH /api/v1/user/preferences
```
Supports timer screen with variant selection and leaf badge count.

### Groups Screen
```
GET /api/v1/groups
GET /api/v1/groups/:id/stats
GET /api/v1/groups/:id/members/status
```
Provides sidebar list, aggregate stats, and real-time member status.

### Immersive Mode
```
POST /api/v1/sessions/start
POST /api/v1/sessions/:id/complete
POST /api/v1/sessions/:id/abandon
```
Live session tracking with 80% completion validation.

---

## Environment Setup (Optional)

For testing against multiple environments:

### Create Environments

1. Click **Environments** (left sidebar)
2. Click **+** to create new environment
3. Name it (e.g., "Local", "Production")
4. Add variables:
   - `baseUrl` = `http://localhost:3000` (Local)
   - `baseUrl` = `https://api.focusforest.app` (Production)
5. Click **Save**

### Switch Environments

1. Click environment dropdown (top right)
2. Select environment
3. All requests will use that `baseUrl`

---

## Exporting Test Results

After running collection:

1. Click **Runner** tab
2. Click **Export Results**
3. Choose format (JSON or CSV)
4. Save file

---

## Tips

### Auto-Save Responses

1. Click request
2. Click **Save Response**
3. Click **Save as Example**
4. Response will be saved for reference

### Organize Requests

- Use folders to group related requests
- Add descriptions to requests
- Use meaningful request names

### Share Collection

1. Click collection name
2. Click **Share**
3. Generate link or export file
4. Share with team

---

## Comparison with v1

### New in v2

- ✅ Stats endpoints (summary, streak)
- ✅ Timer variants endpoint
- ✅ User preferences endpoints
- ✅ Groups list endpoint
- ✅ Group stats endpoint
- ✅ Member status endpoint
- ✅ Immersive mode session endpoints
- ✅ Profile update endpoint
- ✅ Cleaner test scripts
- ✅ Better organization

### Removed from v2

- ❌ Verbose test scripts (simplified)
- ❌ Edge case folder (moved to separate collection)
- ❌ Dev tools folder (use manually)

---

## Next Steps

1. **Import collection** into Postman
2. **Start dev server** (`npm run dev`)
3. **Run Health Check** to verify
4. **Run Auth folder** to get JWT
5. **Test new endpoints** (Stats, Timer, Groups)
6. **Report any issues** you find

---

## Support

- **API Documentation:** `docs/API.md`
- **Implementation Guides:**
  - `TIMER_PREFERENCES_IMPLEMENTATION.md`
  - `GROUPS_SCREEN_ENDPOINTS.md`
- **Quick Tests:**
  - `TIMER_PREFERENCES_TESTING.md`
  - `GROUPS_SCREEN_QUICK_TEST.md`

---

**Happy Testing!** 🚀
