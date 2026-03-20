import { prisma } from "../lib/prisma";

// glow_level: 0–4
function computeGlowLevel(sessionsWithTask: number, totalSessions: number): number {
  if (totalSessions === 0) return 0;
  return Math.min(4, Math.floor((sessionsWithTask / totalSessions) * 4));
}

// stage: 0–4. Thresholds: 1.0 / 2.0 / 3.0 / 4.0
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
// NOTE: The session row is written to DB *before* this function runs (sessions.ts
// step 4 → 5). We compute cumulative stageProgress by summing all sessions
// within the user's local calendar day window.
export async function upsertDailyTree(
  userId: string,
  stageProgressDelta: number,
  taskStatus: "completed" | "carried" | "none"
): Promise<TreeState> {
  const hadTask = taskStatus === "completed";

  // Get user's UTC offset
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { utcOffset: true },
  });

  // Compute user's local date string ("YYYY-MM-DD") — used as the date key in daily_trees
  const nowUtcMs = Date.now() + user.utcOffset * 60 * 1000;
  const dateStr = new Date(nowUtcMs).toISOString().slice(0, 10);
  const todayDate = new Date(dateStr); // "YYYY-MM-DDT00:00:00.000Z" — date key in DB

  // Compute the real UTC timestamps for the start/end of the user's local day.
  // Example: IST is UTC+330. Local midnight IST = UTC midnight - 5h30m = 18:30 UTC prev day.
  const localDayStartUtc = new Date(todayDate.getTime() - user.utcOffset * 60 * 1000);
  const localDayEndUtc = new Date(localDayStartUtc.getTime() + 24 * 60 * 60 * 1000);

  // Sum all sessions (including the one just written) in the user's local day window.
  const agg = await prisma.session.aggregate({
    where: {
      userId,
      createdAt: { gte: localDayStartUtc, lt: localDayEndUtc },
    },
    _sum: { stageProgress: true },
  });

  // This is the true cumulative stageProgress for today (includes current session).
  const newCumulativeProgress = agg._sum.stageProgress ?? stageProgressDelta;

  // Read existing row for current counts
  const existing = await prisma.dailyTree.findUnique({
    where: { userId_date: { userId, date: todayDate } },
  });

  const newTotalSessions = (existing?.totalSessions ?? 0) + 1;
  const newSessionsWithTask = (existing?.sessionsWithTask ?? 0) + (hadTask ? 1 : 0);
  const newStage = computeStage(newCumulativeProgress);
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
