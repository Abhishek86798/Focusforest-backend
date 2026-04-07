# Postman Collection v2 — Summary

**File:** `docs/FocusForest_Complete_v2.postman_collection.json`  
**Created:** 2026-04-07  
**Status:** ✅ Ready to import

---

## What's New

Created a comprehensive Postman collection with ALL FocusForest backend endpoints, including all the new features added recently.

---

## Quick Import

### Step 1: Open Postman
Launch Postman Desktop or Web

### Step 2: Import File
1. Click **Import** button (top left)
2. Select **File** tab
3. Choose: `docs/FocusForest_Complete_v2.postman_collection.json`
4. Click **Import**

### Step 3: Start Testing
1. Start dev server: `npm run dev`
2. Run **Health Check** folder
3. Run **Auth** folder (Signup or Login)
4. Test other endpoints

---

## Collection Structure

### 8 Folders, 27 Endpoints

1. **Health Check** (1 endpoint)
   - GET /health

2. **Auth** (4 endpoints)
   - POST /auth/signup
   - POST /auth/login
   - GET /auth/me
   - PATCH /auth/profile ⭐ NEW

3. **Sessions** (3 endpoints)
   - POST /sessions
   - POST /sessions/start ⭐ NEW
   - GET /sessions

4. **Stats** (2 endpoints) ⭐ NEW
   - GET /stats/summary
   - GET /stats/streak

5. **Timer & Preferences** (3 endpoints) ⭐ NEW
   - GET /timer/variants
   - GET /user/preferences
   - PATCH /user/preferences

6. **Groups** (7 endpoints)
   - POST /groups
   - GET /groups ⭐ NEW
   - GET /groups/:id
   - GET /groups/:id/stats ⭐ NEW
   - GET /groups/:id/members/status ⭐ NEW
   - GET /groups/:id/calendar
   - POST /groups/join

7. **Trees & Calendar** (2 endpoints)
   - GET /trees/today
   - GET /trees/calendar

8. **Leaderboard** (2 endpoints)
   - GET /leaderboard/solo
   - GET /leaderboard/groups

---

## Key Features

### Auto-Save Variables
- JWT token auto-saved on login
- User ID auto-saved on signup/login
- Group ID auto-saved on group creation
- Invite code auto-saved on group creation

### Test Scripts
- Every request has test scripts
- Automatic validation of responses
- Green checkmarks for passed tests
- Red X for failed tests

### Clean Organization
- Logical folder structure
- Descriptive request names
- Helpful descriptions
- Easy to navigate

---

## New Endpoints Included

### Stats (2 endpoints)
```
GET /api/v1/stats/summary
GET /api/v1/stats/streak
```

### Timer & Preferences (3 endpoints)
```
GET /api/v1/timer/variants
GET /api/v1/user/preferences
PATCH /api/v1/user/preferences
```

### Groups Screen (3 new endpoints)
```
GET /api/v1/groups
GET /api/v1/groups/:id/stats
GET /api/v1/groups/:id/members/status
```

### Immersive Mode (1 new endpoint)
```
POST /api/v1/sessions/start
```

### Profile Update (1 new endpoint)
```
PATCH /api/v1/auth/profile
```

---

## Variables

Collection uses these variables:

| Variable | Default | Auto-Set |
|----------|---------|----------|
| baseUrl | http://localhost:3000 | No |
| jwt | (empty) | Yes (Login) |
| userId | (empty) | Yes (Login) |
| groupId | (empty) | Yes (Create Group) |
| inviteCode | (empty) | Yes (Create Group) |
| activeSessionId | (empty) | Yes (Start Session) |

---

## Testing Workflow

### Quick Test (5 minutes)
1. Import collection
2. Start server: `npm run dev`
3. Run **Health Check**
4. Run **Auth** → Login
5. Run **Sessions** → Submit session
6. Run **Stats** → View summary
7. Done!

### Full Test (15 minutes)
1. Import collection
2. Start server
3. Run all 8 folders in order
4. Review test results
5. Check for any failures

### Continuous Testing
1. Make code changes
2. Run relevant folder
3. Verify tests pass
4. Commit changes

---

## Files Created

```
docs/
├── FocusForest_Complete_v2.postman_collection.json  ← Import this
└── POSTMAN_COLLECTION_V2_GUIDE.md                   ← Read this

POSTMAN_COLLECTION_V2_SUMMARY.md                     ← You are here
```

---

## Comparison with v1

### What's Better in v2

✅ All new endpoints included  
✅ Cleaner test scripts  
✅ Better organization  
✅ More descriptive names  
✅ Auto-save variables  
✅ Comprehensive coverage  

### What's Different

- Removed verbose test scripts (simplified)
- Removed edge case folder (separate collection)
- Removed dev tools folder (use manually)
- Added 10 new endpoints
- Reorganized into 8 folders

---

## Quick Reference

### Import Command
```
File → Import → Choose File → FocusForest_Complete_v2.postman_collection.json
```

### Run Collection
```
Collection → Run → Select All → Run
```

### Run Folder
```
Folder → ... → Run Folder
```

### Run Request
```
Request → Send
```

---

## Troubleshooting

### 401 Unauthorized
→ Run **POST /auth/login** first

### 404 Not Found
→ Check `baseUrl` variable is correct

### Connection Refused
→ Start dev server: `npm run dev`

### 409 Email Taken
→ Expected! Run **POST /auth/login** instead

---

## Documentation

- **Import Guide:** `docs/POSTMAN_COLLECTION_V2_GUIDE.md`
- **API Reference:** `docs/API.md`
- **Implementation Guides:**
  - Timer & Preferences: `TIMER_PREFERENCES_IMPLEMENTATION.md`
  - Groups Screen: `GROUPS_SCREEN_ENDPOINTS.md`
  - Stats: `SUMMARY.md` (Stats section)

---

## Next Steps

1. ✅ Import collection into Postman
2. ✅ Start dev server
3. ✅ Run Health Check
4. ✅ Run Auth folder
5. ✅ Test new endpoints
6. ✅ Report any issues

---

**Ready to import and test!** 🚀

Import file: `docs/FocusForest_Complete_v2.postman_collection.json`
