export interface StreakState {
    currentStreak: number;
    longestStreak: number;
}
/**
 * Parses a "YYYY-MM-DD" string into a UTC midnight Date.
 */
export declare function toUtcMidnight(dateStr: string): Date;
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
export declare function upsertStreak(userId: string, activeDate: Date): Promise<StreakState>;
/**
 * Resets currentStreak to 0 for a user who missed a day (is_bare = true).
 * longestStreak is preserved — it stays as a historical high score.
 * lastActiveDate is NOT updated (the day was bare — no sessions occurred).
 *
 * If no streak row exists yet, this is a no-op (user hasn't started yet).
 */
export declare function resetStreak(userId: string): Promise<void>;
//# sourceMappingURL=streakService.d.ts.map