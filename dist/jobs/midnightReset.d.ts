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
export declare function runMidnightReset(): Promise<void>;
/**
 * Starts the midnight cron job.
 * Fires at the top of every hour ("0 * * * *") — processes users in the batch
 * whose local time is currently 00:00.
 *
 * Called once during server startup from src/index.ts.
 */
export declare function startMidnightCron(): void;
//# sourceMappingURL=midnightReset.d.ts.map