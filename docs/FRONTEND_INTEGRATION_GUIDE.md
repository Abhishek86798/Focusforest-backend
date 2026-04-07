# FocusForest — Frontend Integration Guide

**Last Updated:** 2026-04-07  
**API Reference:** See [API.md](./API.md) for complete endpoint documentation

---

## Quick Start

### Base Configuration

```typescript
// config/api.ts
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

// All requests automatically include httpOnly cookies (sb-access-token)
export const apiClient = {
  get: (path: string) => fetch(`${API_BASE_URL}${path}`, { credentials: 'include' }),
  post: (path: string, body: any) => fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body)
  }),
  patch: (path: string, body: any) => fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body)
  }),
  delete: (path: string) => fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    credentials: 'include'
  })
};
```

---

## Screen-by-Screen Integration

### Screen 1: Home (Timer)

**Data Requirements:**
- Current streak badge
- Timer variants list
- User's selected variant
- Last task text

**API Calls:**
```typescript
// On screen load
const [streak, variants, preferences] = await Promise.all([
  apiClient.get('/stats/streak'),
  apiClient.get('/timer/variants'),
  apiClient.get('/user/preferences')
]);

// Display
const streakBadge = streak.currentStreak; // "12"
const selectedVariant = variants.variants.find(v => v.id === preferences.selectedVariant);
const lastTask = preferences.lastTaskText;
```

**On Variant Change:**
```typescript
await apiClient.patch('/user/preferences', {
  selectedVariant: 'deep' // classic | sprint | deep | ultra
});
```

---

### Screen 2: Timer Focus Mode

**Starting a Session:**
```typescript
import { v4 as uuidv4 } from 'uuid';

const clientSessionId = uuidv4();
const response = await apiClient.post('/sessions/start', {
  variant: 'classic',
  focusMinutes: 25,
  taskText: 'Finish Chapter 4',
  clientSessionId
});

const { sessionId, expectedEndAt } = response;
// Start countdown timer using expectedEndAt
```

**Completing a Session:**
```typescript
const response = await apiClient.post(`/sessions/${sessionId}/complete`, {
  taskStatus: 'completed' // completed | carried | none
});

const { tree, streak } = response;
// tree.stage, tree.glowLevel, tree.stageProgress
// streak.currentStreak
```

**Abandoning a Session:**
```typescript
await apiClient.post(`/sessions/${sessionId}/abandon`);
```

---

### Screen 3: Zen Mode (Post-Session)

**Data Requirements:**
- Total sessions count

**API Calls:**
```typescript
const stats = await apiClient.get('/stats/summary');
const totalSessions = stats.sessions; // "You did 45 sessions"
```

---

### Screen 4: Dashboard

**Data Requirements:**
- Streak badge
- 4 stat cards (minutes, trees, sessions, task completion %)
- This week's 7-day grid
- Session history log

**API Calls:**
```typescript
// On screen load
const [streak, stats, weekTrees, sessions] = await Promise.all([
  apiClient.get('/stats/streak'),
  apiClient.get('/stats/summary'),
  apiClient.get('/trees/week/2026-W15'), // Current week
  apiClient.get('/sessions?limit=20')
]);

// Display stat cards
const statCards = {
  totalMinutes: stats.totalMinutes,
  treesCompleted: stats.treesCompleted,
  sessions: stats.sessions,
  taskCompletionRate: Math.round(stats.taskCompletionRate * 100) + '%'
};

// Display week grid
const weekGrid = weekTrees.days; // Array of 7 days with stage, glowLevel
```

---

### Screen 5: Calendar

**Data Requirements:**
- Full year calendar grid
- Monthly stats
- Weekly efforts table

**API Calls:**
```typescript
// Full year view
const calendar = await apiClient.get('/trees/calendar');
const allTrees = calendar.trees; // Array of all daily trees

// Filter by month (optional)
const monthTrees = await apiClient.get('/trees/calendar?month=4&year=2026');

// Get stats for selected month
const stats = await apiClient.get('/stats/summary');

// Get weekly breakdown for a month
const weeks = ['2026-W14', '2026-W15', '2026-W16', '2026-W17'];
const weeklyData = await Promise.all(
  weeks.map(weekId => apiClient.get(`/trees/week/${weekId}`))
);
```

**Group Calendar Toggle:**
```typescript
// Solo calendar (default)
const soloCalendar = await apiClient.get('/trees/calendar');

// Group calendar
const groupCalendar = await apiClient.get(`/groups/${groupId}/calendar?month=4&year=2026`);
```

---

### Screen 6: Groups

**Data Requirements:**
- User's groups list with active counts
- Selected group stats
- Member status table
- This week's group forest

**API Calls:**
```typescript
// On screen load
const groups = await apiClient.get('/groups');
const userGroups = groups.groups; // Array with activeMemberCount, isAdmin

// When group selected
const [groupDetails, groupStats, memberStatus, weekTrees] = await Promise.all([
  apiClient.get(`/groups/${groupId}`),
  apiClient.get(`/groups/${groupId}/stats`),
  apiClient.get(`/groups/${groupId}/members/status`),
  apiClient.get('/trees/week/2026-W15')
]);

// Display stat tiles
const statTiles = {
  totalMinutes: groupStats.totalMinutes,
  treesCompleted: groupStats.treesCompleted,
  sessions: groupStats.sessions,
  todayTreeCount: groupStats.todayTreeCount
};

// Display member table
const members = memberStatus.members.map(m => ({
  name: m.name,
  status: m.status, // "focus_session" | "afk"
  streak: m.personalStreak,
  contribution: m.contribution
}));
```

**Creating a Group:**
```typescript
const response = await apiClient.post('/groups', {
  name: 'Study Squad'
});

const { id, inviteCode } = response;
// Share inviteCode with friends
```

**Joining a Group:**
```typescript
const response = await apiClient.post('/groups/join', {
  inviteCode: 'XK7P2Q'
});

const { id, name, memberCount } = response;
```

**Deleting a Group (Admin Only):**
```typescript
await apiClient.delete(`/groups/${groupId}`);
```

---

### Screen 7: Leaderboard

**Data Requirements:**
- Solo rankings (rank, name, trees, streak)
- Group rankings
- Pagination

**API Calls:**
```typescript
// Solo leaderboard
const soloLeaderboard = await apiClient.get('/leaderboard/solo?page=1&limit=20');
const soloEntries = soloLeaderboard.entries;

// Group leaderboard
const groupLeaderboard = await apiClient.get('/leaderboard/groups?page=1&limit=20');
const groupEntries = groupLeaderboard.entries;

// Pagination
const nextPage = await apiClient.get(`/leaderboard/solo?page=2&limit=20`);
```

**Display Top 3 with Special Styling:**
```typescript
const topThree = soloEntries.slice(0, 3);
topThree.forEach((entry, index) => {
  const medal = ['🥇', '🥈', '🥉'][index];
  console.log(`${medal} ${entry.name} - ${entry.totalTrees} trees`);
});
```

---

### Screen 8: Profile

**Data Requirements:**
- User profile (name, avatar, email)
- Current streak
- Trees grown (all-time)
- Focus hours (all-time)
- Timer variant preference
- Timezone setting

**API Calls:**
```typescript
// On screen load
const [user, streak, stats] = await Promise.all([
  apiClient.get('/auth/me'),
  apiClient.get('/stats/streak'),
  apiClient.get('/stats/summary')
]);

// Display profile
const profile = {
  name: user.name,
  email: user.email,
  avatarUrl: user.avatarUrl,
  currentStreak: streak.currentStreak,
  treesGrown: stats.treesCompleted,
  focusHours: Math.round(stats.totalMinutes / 60)
};
```

**Optional: Weekly Tree Delta**
```typescript
// Get current week's trees
const currentWeek = await apiClient.get('/trees/week/2026-W15');
const treesThisWeek = currentWeek.days.filter(d => d.stage === 4).length;
// Display: "1,482 trees (+12 this week)"
```

**Updating Profile:**
```typescript
// Update name or privacy
await apiClient.patch('/auth/profile', {
  name: 'Alice',
  isPrivate: true // Opt out of global leaderboard
});

// Update timer preference
await apiClient.patch('/user/preferences', {
  selectedVariant: 'deep'
});
```

**Sign Out:**
```typescript
await apiClient.post('/auth/logout');
// Redirect to login screen
```

---

## Common Patterns

### Error Handling

```typescript
async function handleApiCall<T>(apiCall: Promise<Response>): Promise<T> {
  try {
    const response = await apiCall;
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }
    
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Usage
try {
  const stats = await handleApiCall(apiClient.get('/stats/summary'));
} catch (error) {
  // Show error toast/notification
}
```

### Authentication State

```typescript
// Check if user is authenticated
const checkAuth = async () => {
  try {
    const user = await apiClient.get('/auth/me');
    return user;
  } catch (error) {
    // Not authenticated, redirect to login
    return null;
  }
};
```

### Session Deduplication

```typescript
import { v4 as uuidv4 } from 'uuid';

// Generate once per session attempt
const clientSessionId = uuidv4();

// Store in localStorage to prevent duplicate submissions on retry
localStorage.setItem('currentSessionId', clientSessionId);

// On submit
await apiClient.post('/sessions', {
  variant: 'classic',
  focusMinutes: 25,
  taskStatus: 'completed',
  clientSessionId // Backend will reject duplicates with 409
});
```

---

## TypeScript Types

```typescript
// types/api.ts

export type TimerVariant = 'classic' | 'sprint' | 'deep' | 'ultra';
export type TaskStatus = 'completed' | 'carried' | 'none';
export type SessionState = 'active' | 'completed' | 'abandoned';
export type MemberStatus = 'focus_session' | 'afk';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  utcOffset: number;
  isPrivate: boolean;
  createdAt: string;
}

export interface TreeState {
  stage: 0 | 1 | 2 | 3 | 4;
  glowLevel: 0 | 1 | 2 | 3 | 4;
  stageProgress: number;
  totalSessions: number;
  sessionsWithTask: number;
}

export interface DailyTree {
  date: string; // YYYY-MM-DD
  stage: 0 | 1 | 2 | 3 | 4;
  glowLevel: 0 | 1 | 2 | 3 | 4;
  totalSessions: number;
  sessionsWithTask: number;
  isBare: boolean;
  finalisedAt: string | null;
}

export interface Streak {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

export interface Stats {
  totalMinutes: number;
  treesCompleted: number;
  sessions: number;
  taskCompletionRate: number; // 0.0 - 1.0
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  activeMemberCount: number;
  isAdmin: boolean;
}

export interface GroupStats {
  totalMinutes: number;
  treesCompleted: number;
  sessions: number;
  todayTreeCount: number;
}

export interface MemberStatus {
  userId: string;
  name: string;
  avatarUrl: string | null;
  status: MemberStatus;
  personalStreak: number;
  contribution: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  totalTrees: number;
  currentStreak: number;
}

export interface GroupLeaderboardEntry {
  rank: number;
  groupId: string;
  name: string;
  totalTrees: number;
  memberCount: number;
}
```

---

## Environment Variables

```bash
# .env.local (Next.js)
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1

# Production
NEXT_PUBLIC_API_URL=https://api.focusforest.app/api/v1
```

---

## Testing Checklist

### Authentication Flow
- [ ] Signup creates account and sets cookies
- [ ] Login sets cookies and returns user
- [ ] Logout clears cookies
- [ ] Protected routes redirect when not authenticated
- [ ] Auth state persists across page refreshes

### Session Flow
- [ ] Start session returns sessionId and expectedEndAt
- [ ] Complete session updates tree and streak
- [ ] Abandon session marks as abandoned
- [ ] Cannot complete session before 80% elapsed
- [ ] Duplicate clientSessionId returns 409

### Data Display
- [ ] Dashboard shows correct stats
- [ ] Calendar displays all trees
- [ ] Groups list shows active member counts
- [ ] Leaderboard shows rankings
- [ ] Profile displays user info

### Real-time Updates
- [ ] Tree stage updates after session
- [ ] Streak increments correctly
- [ ] Group member status reflects active sessions
- [ ] Leaderboard updates after midnight cron

---

## Common Issues & Solutions

### Issue: Cookies not being sent
**Solution:** Ensure `credentials: 'include'` is set on all fetch requests

### Issue: CORS errors
**Solution:** Backend must include your frontend domain in `APP_URL` environment variable

### Issue: 401 Unauthorized on protected routes
**Solution:** Check that cookies are being sent and user is logged in

### Issue: Session not updating tree
**Solution:** Verify `clientSessionId` is unique per session attempt

### Issue: Timezone issues with "today's tree"
**Solution:** Backend uses user's `utcOffset` field to determine local date

---

## Next Steps

1. **Set up API client** — Create `config/api.ts` with base configuration
2. **Define TypeScript types** — Copy types from this guide to `types/api.ts`
3. **Implement authentication** — Start with signup/login/logout flow
4. **Build screens incrementally** — Follow the screen-by-screen integration guide
5. **Test with Postman collection** — Use `docs/FocusForest_Complete_v2.postman_collection.json` to verify endpoints
6. **Handle errors gracefully** — Implement error boundaries and toast notifications
7. **Add loading states** — Show spinners during API calls
8. **Optimize performance** — Use React Query or SWR for caching and revalidation

---

## Additional Resources

- **Complete API Reference:** [API.md](./API.md)
- **Gap Analysis:** [UI_API_GAP_ANALYSIS.md](../UI_API_GAP_ANALYSIS.md)
- **Postman Collection:** [FocusForest_Complete_v2.postman_collection.json](./FocusForest_Complete_v2.postman_collection.json)
- **Backend Summary:** [SUMMARY.md](../SUMMARY.md)
