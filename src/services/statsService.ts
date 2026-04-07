import { prisma } from "../lib/prisma";

export interface SummaryStats {
  totalMinutes: number;
  treesCompleted: number;
  sessions: number;
  taskCompletionRate: number;
}

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

export async function getSummaryStats(userId: string): Promise<SummaryStats> {
  // Query total minutes using aggregate sum
  const minutesAgg = await prisma.session.aggregate({
    where: { userId, state: 'completed' },
    _sum: { focusMinutes: true }
  });

  // Query trees completed (stage = 4)
  const treesCount = await prisma.dailyTree.count({
    where: { userId, stage: 4 }
  });

  // Query total completed sessions
  const sessionsCount = await prisma.session.count({
    where: { userId, state: 'completed' }
  });

  // Query completed tasks (completed sessions with taskStatus = 'completed')
  const tasksCompletedCount = await prisma.session.count({
    where: { userId, state: 'completed', taskStatus: 'completed' }
  });

  // Calculate task completion rate (return 0 if no sessions)
  const taskCompletionRate = sessionsCount > 0 
    ? tasksCompletedCount / sessionsCount 
    : 0;

  return {
    totalMinutes: minutesAgg._sum.focusMinutes ?? 0,
    treesCompleted: treesCount,
    sessions: sessionsCount,
    taskCompletionRate
  };
}

export async function getStreakStats(userId: string): Promise<StreakStats> {
  // Query streak record using findUnique
  const streak = await prisma.streak.findUnique({
    where: { userId },
    select: {
      currentStreak: true,
      longestStreak: true,
      lastActiveDate: true
    }
  });

  // If no streak record exists, return default values
  if (!streak) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null
    };
  }

  // Format lastActiveDate as YYYY-MM-DD string
  const formattedDate = streak.lastActiveDate.toISOString().split('T')[0];

  return {
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    lastActiveDate: formattedDate
  };
}
