# FocusForest Backend — Render Deployment Guide

**Last updated:** 2026-03-21  
**Target platform:** Render.com  
**Estimated time:** 15 minutes

---

## Prerequisites

Before you start, ensure you have:

- [ ] GitHub repository with your code pushed (including `render.yaml`)
- [ ] Supabase project created with all tables migrated
- [ ] Upstash Redis database created
- [ ] All credentials from `.env` file ready to copy

---

## Step 1: Create a New Web Service on Render

1. Go to [https://render.com](https://render.com) and log in
2. Click the **"New +"** button in the top right corner
3. Select **"Web Service"** from the dropdown menu
4. You'll see a "Create a new Web Service" page

---

## Step 2: Connect Your Repository

### Option A: If your repo is already connected to Render
1. Find your repository in the list
2. Click **"Connect"** next to `focusforest-backend` (or your repo name)

### Option B: If this is your first time
1. Click **"Connect a repository"**
2. Choose **GitHub** (or GitLab/Bitbucket if applicable)
3. Authorize Render to access your repositories
4. Select the repository containing your FocusForest backend code
5. Click **"Connect"**

### Branch Selection
- **Branch:** `main` (or `master` if that's your default branch)
- Render will auto-detect it's a Node.js project

---

## Step 3: Configure Build Settings

On the "Create Web Service" configuration page, fill in:

### Basic Settings
- **Name:** `focusforest-backend` (or any name you prefer)
  - This will become your URL: `https://focusforest-backend.onrender.com`
- **Region:** Choose closest to your Supabase region
  - If Supabase is in Sydney (`ap-southeast-2`), choose **Singapore**
- **Branch:** `main` (should be auto-selected)
- **Root Directory:** Leave blank (project is at root)
- **Runtime:** **Node** (should be auto-detected)

### Build & Start Commands
- **Build Command:**
  ```
  npm install && npm run build && npx prisma generate
  ```
  
- **Start Command:**
  ```
  npm start
  ```

### Instance Type
- **Free** (for testing) or **Starter** ($7/month for production)
- Free tier sleeps after 15 min of inactivity — not ideal for cron jobs
- **Recommendation:** Use Starter tier so midnight cron runs reliably

---

## Step 4: Add Environment Variables

Scroll down to the **"Environment Variables"** section and click **"Add Environment Variable"**.

Add each variable below. Copy the values from your local `.env` file.

### 4.1 Server Configuration

| Key | Value | Where to find it |
|-----|-------|------------------|
| `NODE_ENV` | `production` | Type this exactly |
| `PORT` | `3000` | Type this exactly (Render will override with its own port, but this is a fallback) |
| `APP_URL` | `https://your-frontend-domain.com` | Your frontend URL (or `http://localhost:5173` for testing) |
| `COOKIE_SECRET` | Copy from your `.env` | Your local `.env` file |

### 4.2 Database — Supabase PostgreSQL

| Key | Value | Where to find it |
|-----|-------|------------------|
| `DATABASE_URL` | `postgresql://postgres.[ref]:[password]@...` | Supabase Dashboard → Project Settings → Database → Connection string → **Transaction mode** (with `?pgbouncer=true`) |
| `DIRECT_URL` | `postgresql://postgres.[ref]:[password]@...` | Supabase Dashboard → Project Settings → Database → Connection string → **Session mode** (port 5432, no pgbouncer) |

### 4.3 Authentication — Supabase Auth

| Key | Value | Where to find it |
|-----|-------|------------------|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Supabase Dashboard → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6...` | Supabase Dashboard → Project Settings → API → Project API keys → **anon** **public** |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6...` | Supabase Dashboard → Project Settings → API → Project API keys → **service_role** **secret** |

### 4.4 Cache & Leaderboard — Upstash Redis

| Key | Value | Where to find it |
|-----|-------|------------------|
| `UPSTASH_REDIS_REST_URL` | `https://xxxxx.upstash.io` | Upstash Console → Your Database → REST API → **UPSTASH_REDIS_REST_URL** |
| `UPSTASH_REDIS_REST_TOKEN` | `AXxxxxxxxxxxxx...` | Upstash Console → Your Database → REST API → **UPSTASH_REDIS_REST_TOKEN** |

---

## Step 5: Deploy

1. Scroll to the bottom of the page
2. Click **"Create Web Service"**
3. Render will start building your app
4. Watch the build logs in real-time
5. Wait for the status to change from "Building" → "Live" (usually 2-5 minutes)

### Expected Build Output
You should see:
```
==> Building...
npm install
npm run build
> tsc
npx prisma generate
✔ Generated Prisma Client

==> Deploying...
==> Starting service with 'npm start'
FocusForest API running on http://localhost:10000
Environment: production
[midnightCron] Midnight reset cron scheduled (fires every hour at :00).
```

---

## Step 6: Verify Deployment Success

### 6.1 Health Check
1. Copy your Render service URL from the dashboard
   - Format: `https://focusforest-backend.onrender.com`
2. Open in browser or use curl:
   ```bash
   curl https://focusforest-backend.onrender.com/health
   ```
3. Expected response:
   ```json
   {
     "status": "ok",
     "timestamp": "2026-03-21T12:34:56.789Z"
   }
   ```

### 6.2 Test Auth Endpoint
```bash
curl https://focusforest-backend.onrender.com/api/v1/auth/me
```
Expected response (401 because no token):
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Please log in."
  }
}
```

### 6.3 Check Logs for Startup Messages
1. In Render dashboard, click on your service
2. Click **"Logs"** tab
3. Look for these lines:
   ```
   FocusForest API running on http://localhost:10000
   Environment: production
   [midnightCron] Midnight reset cron scheduled (fires every hour at :00).
   ```

---

## Step 7: Verify Midnight Cron is Running

### Method 1: Check Logs at the Top of Any Hour
1. Go to Render dashboard → Your service → **Logs** tab
2. Wait until the top of the next hour (e.g., 3:00 PM, 4:00 PM)
3. Look for log entries like:
   ```
   [midnightReset] Running at 2026-03-21T15:00:00.123Z — targeting UTC offsets: -900 min
   [midnightReset] Processing 3 user(s).
   [midnightReset] User abc123: finalised 2026-03-21 — stage=2, sessions=2, isBare=false
   [midnightReset] Done.
   ```

### Method 2: Trigger Manual Reset (Development Only)
**Note:** This only works if you set `NODE_ENV=development` temporarily.

1. Temporarily change `NODE_ENV` to `development` in Render env vars
2. Wait for service to restart
3. Send a POST request:
   ```bash
   curl -X POST https://focusforest-backend.onrender.com/dev/midnight-reset
   ```
4. Check response:
   ```json
   {
     "ok": true,
     "message": "Midnight reset ran successfully. Check server logs."
   }
   ```
5. **Important:** Change `NODE_ENV` back to `production` after testing

### Method 3: Monitor Database
1. Go to Supabase Dashboard → Table Editor → `daily_trees`
2. Check the `finalised_at` column
3. After midnight in any user's timezone, you should see rows with `finalised_at` timestamps

---

## Step 8: Update Frontend Configuration

Once your backend is live, update your frontend to use the production API URL:

- **API Base URL:** `https://focusforest-backend.onrender.com/api/v1`
- Update CORS settings if needed (the `APP_URL` env var should match your frontend domain)

---

## Troubleshooting

### Build Fails
- Check build logs for errors
- Verify all dependencies are in `package.json`
- Ensure `tsconfig.json` is committed to repo

### Service Crashes on Startup
- Check logs for error messages
- Verify all environment variables are set correctly
- Common issues:
  - Missing `DATABASE_URL` or `DIRECT_URL`
  - Invalid Supabase credentials
  - Invalid Redis credentials

### Cron Not Running
- Verify service is on **Starter** tier (not Free)
- Free tier sleeps after 15 min → cron won't fire
- Check logs at the top of the hour for `[midnightReset]` entries

### Database Connection Errors
- Verify `DATABASE_URL` has `?pgbouncer=true` at the end
- Verify `DIRECT_URL` uses port `5432` (not `6543`)
- Check Supabase project is not paused

### Redis Connection Errors
- Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are correct
- Check Upstash database is active (not deleted)

---

## Post-Deployment Checklist

- [ ] Health check returns `200 OK`
- [ ] Auth endpoints return proper error messages
- [ ] Logs show "Midnight reset cron scheduled"
- [ ] Cron fires at the top of the hour (check logs)
- [ ] Frontend can connect to backend API
- [ ] Test a full user flow: signup → login → create session → check tree

---

## Monitoring & Maintenance

### View Logs
- Render Dashboard → Your Service → **Logs** tab
- Real-time streaming logs
- Filter by log level or search for keywords

### Restart Service
- Render Dashboard → Your Service → **Manual Deploy** → **Clear build cache & deploy**

### Update Environment Variables
- Render Dashboard → Your Service → **Environment** tab
- Add/edit/delete variables
- Service auto-restarts after changes

### Scale Up/Down
- Render Dashboard → Your Service → **Settings** tab
- Change instance type (Free → Starter → Standard)

---

## Next Steps

1. **Update Postman Collection**
   - Change base URL to `https://focusforest-backend.onrender.com`
   - Re-run all tests against production

2. **Set Up Monitoring**
   - Consider adding error tracking (Sentry, LogRocket)
   - Set up uptime monitoring (UptimeRobot, Pingdom)

3. **Database Backups**
   - Supabase automatically backs up your database
   - Verify backup schedule in Supabase Dashboard

4. **Deploy Frontend**
   - Deploy frontend to Vercel/Netlify
   - Update `APP_URL` env var to match frontend domain

---

## Support

- **Render Docs:** https://render.com/docs
- **Render Community:** https://community.render.com
- **Supabase Docs:** https://supabase.com/docs
- **Upstash Docs:** https://docs.upstash.com

---

**Deployment complete! 🎉**
