import { prisma } from "../lib/prisma";

// glow_level: 0–4
// Computed as: Math.floor((sessionsWithTask / totalSessions) * 4)
// 4 = full golden glow (all sessions had completed tasks)
// 0 = plain tree (no tasks set)
function computeGlowLevel(sessionsWithTask: number, totalSessions: number): number {
  if (totalSessions === 0) return 0;
  return Math.min(4, Math.floor((sessionsWithTask / totalSessions) * 4));
}

// stage: 0–4. Increments are cumulative — once a point threshold is crossed, stage advances.
// Thresholds: 0 → 1.0 → 2.0 → 3.0 → 4.0
function computeStage(cumulativeProgress: number): number {
  if (cumulativeProgress >= 4.0) return 4;
  if (cumulativeProgress >= 3.0) return 3;
  if (cumulativeProgress >= 2.0) return 2;
  if (cumulativeProgress >= 1.0) return 1;
  return 0;
}

export interface TreeState {
  stage: number;
  glowLevel: number;
  stageProgress: number; // cumulative progress today
  totalSessions: number;
  sessionsWithTask: number;
}

// Upserts the daily_trees row for today (user's local date based on utcOffset).
// Creates the row if it's the first session of the day.
// Increments sessions, recalculates stage and glow_level on every subsequent session.
export async function upsertDailyTree(
  userId: string,
  stageProgressDelta: number,
  taskStatus: "completed" | "carried" | "none"
): Promise<TreeState> {
  const hadTask = taskStatus === "completed";

  // Get user's UTC offset to determine their local calendar date
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { utcOffset: true },
  });

  // Compute user's local date
  const nowUtcMs = Date.now() + user.utcOffset * 60 * 1000;
  const localDate = new Date(nowUtcMs);
  // Zero out time to get just the date
  const dateStr = localDate.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const todayDate = new Date(dateStr);

  // Upsert: create or update the daily_trees row
  const existing = await prisma.dailyTree.findUnique({
    where: { userId_date: { userId, date: todayDate } },
  });

  let newTotalSessions: number;
  let newSessionsWithTask: number;
  let newCumulativeProgress: number;

  if (!existing) {
    // First session today — create the row
    newTotalSessions = 1;
    newSessionsWithTask = hadTask ? 1 : 0;
    newCumulativeProgress = stageProgressDelta;
  } else {
    newTotalSessions = existing.totalSessions + 1;
    newSessionsWithTask = existing.sessionsWithTask + (hadTask ? 1 : 0);
    // Read existing cumulative progress back from stage-derived value
    // We store it implicitly — recalculate from existing stage + delta won't work cleanly.
    // Better: store cumulative in a dedicated field. Since our schema uses `stage` (integer),
    // we track cumulative progress via total stage_progress across sessions joined by date.
    // For now, lookup sum from sessions table for today.
    newCumulativeProgress = 0; // will be computed below
  }

  // Compute cumulative stageProgress from sessions today (source of truth)
  const todaySessionsAgg = await prisma.session.aggregate({
    where: {
      userId,
      createdAt: {
        gte: todayDate,
        lt: new Date(todayDate.getTime() + 24 * 60 * 60 * 1000),
      },
    },
    _sum: { stageProgress: true },
    _count: { id: true },
  });

  // Add the new session's progress (not yet written to sessions table at this point)
  newCumulativeProgress = (todaySessionsAgg._sum.stageProgress ?? 0) + stageProgressDelta;
  const newStage = Math.min(4, computeStage(newCumulativeProgress));
  const newGlowLevel = computeGlowLevel(newSessionsWithTask, newTotalSessions);

  const updated = await prisma.dailyTree.upsert({
    where: { userId_date: { userId, date: todayDate } },
    create: {
      userId,
      date: todayDate,
      stage: newStage,
      glowLevel: newGlowLevel,
      totalSessions: newTotalSessions,
      sessionsWithTask: newSessionsWithTask,
      isBare: false,
    },
    update: {
      stage: newStage,
      glowLevel: newGlowLevel,
      totalSessions: newTotalSessions,
      sessionsWithTask: newSessionsWithTask,
      isBare: false,
    },
  });

  return {
    stage: updated.stage,
    glowLevel: updated.glowLevel,
    stageProgress: newCumulativeProgress,
    totalSessions: updated.totalSessions,
    sessionsWithTask: updated.sessionsWithTask,
  };
}
