import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { upsertStreak, resetStreak, toUtcMidnight } from "../services/streakService";
import { updateSoloLeaderboard, updateGroupsLeaderboard } from "../services/leaderboardService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Given the current UTC time, return the set of utc_offset values (in minutes)
 * for users whose local time is currently 00:00 (midnight).
 *
 * A user's local time is midnight when:
 *   UTC hour == 0 and UTC minute == 0 → user offset == 0   (UTC+0)
 *   UTC hour == 1 and UTC minute == 0 → user offset == -60  (UTC-1)
 *   UTC hour == 23 and UTC minute == 0 → user offset == +60 (UTC+1)
 *
 * In general:  local_midnight when utcHour * 60 + utcOffset ≡ 0 (mod 1440)
 *   ⟹ utcOffset = -(utcHour * 60) mod 1440, expressed in canonical range.
 *
 * We target exactly the offset that maps the current UTC hour to local 00:00.
 * Since we fire at :00 of every hour, minute is always 0.
 *
 * Returns an array of offset values (in practice one value, but we return an array
 * to future-proof for half-hour offsets like IST +330, NST -210, etc.).
 */
function getMidnightOffsets(utcDate: Date): number[] {
  const utcHour = utcDate.getUTCHours();
  const utcMinute = utcDate.getUTCMinutes();

  // We process users where local time is 00:00 — so utcHour*60 + offset ≡ 0 mod 1440
  // offset = -(utcHour * 60 + utcMinute) normalised to (-720, +720]
  const rawOffset = -(utcHour * 60 + utcMinute);

  // Express in range (-720, +720] to match how utc_offset is stored
  const offsets = new Set<number>();

  // Primary offset
  const primary = ((rawOffset + 720) % 1440) - 720;
  offsets.add(primary);

  // Handle ±720 equivalence (UTC+12 and UTC-12 are the same moment)
  if (primary === -720) offsets.add(720);
  if (primary === 720) offsets.add(-720);

  return Array.from(offsets);
}

/**
 * Get YYYY-MM-DD string for a user's local "yesterday" relative to their
 * local midnight (i.e., the day that just ended).
 *
 * When midnight fires for a user, their local clock just rolled to 00:00 of a
 * new day. The day that ended is "yesterday" in their timezone.
 *
 * We compute: (utcNow + utcOffset) - 1 day, then format as YYYY-MM-DD.
 */
function getLocalYesterday(utcNow: Date, utcOffsetMinutes: number): string {
  const localMsNow = utcNow.getTime() + utcOffsetMinutes * 60 * 1000;
  // Subtract 1 day (we are exactly at midnight local, so -1 day = yesterday)
  const yesterdayMs = localMsNow - 24 * 60 * 60 * 1000;
  const d = new Date(yesterdayMs);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/**
 * Returns the YYYY-MM-DD string for the local "today" (the new day that just started).
 */
function getLocalToday(utcNow: Date, utcOffsetMinutes: number): string {
  const localMsNow = utcNow.getTime() + utcOffsetMinutes * 60 * 1000;
  const d = new Date(localMsNow);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ---------------------------------------------------------------------------
// Weekly forest completion check
// ---------------------------------------------------------------------------

/**
 * Checks whether the ISO week containing `dateStr` has all 7 days with sessions.
 * ISO week: Monday (day 1) → Sunday (day 7).
 *
 * Called after a tree is finalised — if the completed week is fully filled,
 * we log it here. This is the hook for future archival / notification logic.
 *
 * @param userId  - User to check
 * @param dateStr - YYYY-MM-DD of the day that just ended (yesterday)
 */
async function checkWeeklyForestCompletion(
  userId: string,
  dateStr: string
): Promise<void> {
  const date = new Date(`${dateStr}T00:00:00.000Z`);

  // ISO week: Monday = 1, Sunday = 7
  // JS getUTCDay(): 0=Sun, 1=Mon, ..., 6=Sat → we only check on Sunday (end of ISO week)
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday
  if (dayOfWeek !== 0) return; // Only check at the end of the ISO week (Sunday)

  // Build the Monday of this week
  const mondayMs = date.getTime() - 6 * 24 * 60 * 60 * 1000; // Sunday - 6 days = Monday
  const mondayDate = new Date(mondayMs);
  const sundayDate = date; // = the day that just ended

  // Count how many days in Mon–Sun have total_sessions > 0
  const weekTrees = await prisma.dailyTree.findMany({
    where: {
      userId,
      date: {
        gte: mondayDate,
        lte: sundayDate,
      },
      totalSessions: { gt: 0 },
    },
    select: { date: true },
  });

  if (weekTrees.length === 7) {
    // All 7 days had at least one session — the weekly forest is complete!
    const weekLabel = getISOWeekLabel(mondayDate);
    console.log(
      `[midnightReset] 🌳 Weekly forest COMPLETE for user ${userId} — week ${weekLabel}`
    );
    // TODO: trigger push notification, write to weekly_forests archive table, etc.
  }
}

/**
 * Returns an ISO week label like "2026-W12".
 */
function getISOWeekLabel(monday: Date): string {
  const year = monday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4)); // Jan 4 is always in week 1
  const weekNum =
    Math.ceil(
      ((monday.getTime() - jan4.getTime()) / 86400000 +
        jan4.getUTCDay() +
        1) /
        7
    );
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Core reset logic
// ---------------------------------------------------------------------------

/**
 * Processes all users whose local time is currently midnight.
 *
 * Pipeline for each user:
 *   1. Finalise yesterday's daily_trees row (lock stage, mark is_bare if needed)
 *   2. Update or reset streak based on whether the tree had sessions
 *   3. Seed a new daily_trees row for today (idempotent upsert)
 *   4. Check if the just-completed ISO week is a full forest
 *
 * Exported separately from the cron schedule so it can be called directly
 * in tests or via the dev trigger route without waiting for :00.
 */
export async function runMidnightReset(): Promise<void> {
  const utcNow = new Date();
  const targetOffsets = getMidnightOffsets(utcNow);

  console.log(
    `[midnightReset] Running at ${utcNow.toISOString()} — targeting UTC offsets: ${targetOffsets.join(", ")} min`
  );

  // Find all users whose utc_offset matches the current midnight batch
  const users = await prisma.user.findMany({
    where: { utcOffset: { in: targetOffsets } },
    select: { id: true, utcOffset: true },
  });

  if (users.length === 0) {
    console.log(`[midnightReset] No users to process this hour.`);
    return;
  }

  console.log(`[midnightReset] Processing ${users.length} user(s).`);

  // Process each user sequentially to avoid thundering-herd on the DB.
  // For large user bases this should be batched/parallelised with a job queue.
  for (const user of users) {
    try {
      await processUserMidnight(user.id, user.utcOffset, utcNow);
    } catch (err) {
      // Log and continue — one user's failure shouldn't block others
      console.error(`[midnightReset] Error processing user ${user.id}:`, err);
    }
  }

  // After all users are processed, recompute group leaderboard in one pass.
  // (Group membership can change any time, so a full recompute is safest.)
  try {
    await updateGroupsLeaderboard();
    console.log(`[midnightReset] Groups leaderboard updated.`);
  } catch (err) {
    console.error(`[midnightReset] Failed to update groups leaderboard:`, err);
  }

  console.log(`[midnightReset] Done.`);
}

async function processUserMidnight(
  userId: string,
  utcOffset: number,
  utcNow: Date
): Promise<void> {
  const yesterdayStr = getLocalYesterday(utcNow, utcOffset);
  const todayStr = getLocalToday(utcNow, utcOffset);

  const yesterdayDate = toUtcMidnight(yesterdayStr);
  const todayDate = toUtcMidnight(todayStr);

  // ------------------------------------------------------------------
  // Step 1: Finalise yesterday's tree
  // ------------------------------------------------------------------
  const existingTree = await prisma.dailyTree.findUnique({
    where: { userId_date: { userId, date: yesterdayDate } },
  });

  let hadSessions = false;

  if (existingTree && existingTree.finalisedAt) {
    // Already finalised (e.g., double-fire due to server restart) — idempotent
    console.log(
      `[midnightReset] User ${userId}: yesterday (${yesterdayStr}) already finalised. Skipping.`
    );
    hadSessions = existingTree.totalSessions > 0;
  } else if (existingTree) {
    // Tree exists — lock it in
    hadSessions = existingTree.totalSessions > 0;
    const isBare = !hadSessions;

    await prisma.dailyTree.update({
      where: { userId_date: { userId, date: yesterdayDate } },
      data: {
        isBare,
        finalisedAt: utcNow,
      },
    });

    console.log(
      `[midnightReset] User ${userId}: finalised ${yesterdayStr} — stage=${existingTree.stage}, sessions=${existingTree.totalSessions}, isBare=${isBare}`
    );
  } else {
    // No tree at all for yesterday — it was a missed day (bare soil)
    hadSessions = false;

    await prisma.dailyTree.create({
      data: {
        userId,
        date: yesterdayDate,
        stage: 0,
        glowLevel: 0,
        totalSessions: 0,
        sessionsWithTask: 0,
        isBare: true,
        finalisedAt: utcNow,
      },
    });

    console.log(
      `[midnightReset] User ${userId}: no tree for ${yesterdayStr} — created bare soil record.`
    );
  }

  // ------------------------------------------------------------------
  // Step 2: Update or reset streak
  // ------------------------------------------------------------------
  if (hadSessions) {
    await upsertStreak(userId, yesterdayDate);
    console.log(`[midnightReset] User ${userId}: streak incremented for ${yesterdayStr}.`);
  } else {
    await resetStreak(userId);
    console.log(`[midnightReset] User ${userId}: streak reset (missed day ${yesterdayStr}).`);
  }

  // ------------------------------------------------------------------
  // Step 3: Update solo leaderboard score
  // ------------------------------------------------------------------
  try {
    await updateSoloLeaderboard(userId);
    console.log(`[midnightReset] User ${userId}: solo leaderboard updated.`);
  } catch (err) {
    // Non-fatal — Redis down should not fail the whole pipeline
    console.error(`[midnightReset] User ${userId}: failed to update solo leaderboard:`, err);
  }

  // ------------------------------------------------------------------
  // Step 4: Seed next day's tree (idempotent — skip if already exists)
  // ------------------------------------------------------------------
  const nextDayExists = await prisma.dailyTree.findUnique({
    where: { userId_date: { userId, date: todayDate } },
  });

  if (!nextDayExists) {
    await prisma.dailyTree.create({
      data: {
        userId,
        date: todayDate,
        stage: 0,
        glowLevel: 0,
        totalSessions: 0,
        sessionsWithTask: 0,
        isBare: false,
        // finalisedAt is null — this day is in progress
      },
    });
    console.log(`[midnightReset] User ${userId}: seeded new tree for ${todayStr}.`);
  } else {
    console.log(
      `[midnightReset] User ${userId}: tree for ${todayStr} already exists (first session came in before cron). Skipping seed.`
    );
  }

  // ------------------------------------------------------------------
  // Step 5: Weekly forest completion check
  // ------------------------------------------------------------------
  await checkWeeklyForestCompletion(userId, yesterdayStr);
}

// ---------------------------------------------------------------------------
// Cron schedule
// ---------------------------------------------------------------------------

/**
 * Starts the midnight cron job.
 * Fires at the top of every hour ("0 * * * *") — processes users in the batch
 * whose local time is currently 00:00.
 *
 * Called once during server startup from src/index.ts.
 */
export function startMidnightCron(): void {
  // "0 * * * *" = at minute 0 of every hour, every day
  cron.schedule("0 * * * *", async () => {
    try {
      await runMidnightReset();
    } catch (err) {
      console.error("[midnightReset] Unhandled error in cron:", err);
    }
  });

  console.log("[midnightCron] Midnight reset cron scheduled (fires every hour at :00).");
}
