import { prisma } from "../lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the number of whole days between two UTC-normalised Date objects.
 * Both dates should have their time zeroed out to midnight UTC.
 */
function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

/**
 * Parses a "YYYY-MM-DD" string into a UTC midnight Date.
 */
export function toUtcMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

// ---------------------------------------------------------------------------
// upsertStreak
// ---------------------------------------------------------------------------
/**
 * Upserts the streak row for a user based on a local calendar date on which
 * they had at least one session.
 *
 * Called from:
 *  - sessions route  → after a live session is submitted (activeDate = today)
 *  - midnightReset   → after finalising a non-bare tree  (activeDate = yesterday)
 *
 * @param userId     - The user's ID
 * @param activeDate - The local calendar date that had sessions (UTC-midnight Date)
 *
 * Logic:
 *   - No existing row → create with currentStreak = 1
 *   - lastActiveDate == activeDate → same day, no change (idempotent)
 *   - lastActiveDate == activeDate - 1 day → consecutive, increment
 *   - lastActiveDate < activeDate - 1 day → gap, reset to 1
 */
export async function upsertStreak(
  userId: string,
  activeDate: Date
): Promise<StreakState> {
  const existing = await prisma.streak.findUnique({ where: { userId } });

  if (!existing) {
    // First-ever session for this user — create streak row
    const created = await prisma.streak.create({
      data: {
        userId,
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: activeDate,
      },
    });
    return {
      currentStreak: created.currentStreak,
      longestStreak: created.longestStreak,
    };
  }

  const lastDate = new Date(existing.lastActiveDate);
  const diff = daysBetween(lastDate, activeDate);

  let newCurrentStreak: number;

  if (diff === 0) {
    // Same calendar day — already counted, no change needed
    return {
      currentStreak: existing.currentStreak,
      longestStreak: existing.longestStreak,
    };
  } else if (diff === 1) {
    // Consecutive day — increment
    newCurrentStreak = existing.currentStreak + 1;
  } else {
    // Gap — streak broken, reset to 1
    newCurrentStreak = 1;
  }

  const newLongest = Math.max(existing.longestStreak, newCurrentStreak);

  const updated = await prisma.streak.update({
    where: { userId },
    data: {
      currentStreak: newCurrentStreak,
      longestStreak: newLongest,
      lastActiveDate: activeDate,
    },
  });

  return {
    currentStreak: updated.currentStreak,
    longestStreak: updated.longestStreak,
  };
}

// ---------------------------------------------------------------------------
// resetStreak
// ---------------------------------------------------------------------------
/**
 * Resets currentStreak to 0 for a user who missed a day (is_bare = true).
 * longestStreak is preserved — it stays as a historical high score.
 * lastActiveDate is NOT updated (the day was bare — no sessions occurred).
 *
 * If no streak row exists yet, this is a no-op (user hasn't started yet).
 */
export async function resetStreak(userId: string): Promise<void> {
  const existing = await prisma.streak.findUnique({ where: { userId } });
  if (!existing) return; // No streak row yet — nothing to reset

  // Only reset if streak is currently > 0 to avoid unnecessary writes
  if (existing.currentStreak > 0) {
    await prisma.streak.update({
      where: { userId },
      data: { currentStreak: 0 },
    });
  }
}
