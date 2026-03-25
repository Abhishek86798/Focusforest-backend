import { redis } from "../lib/redis";
import { prisma } from "../lib/prisma";

// ---------------------------------------------------------------------------
// Redis key constants
// ---------------------------------------------------------------------------
const SOLO_KEY = "leaderboard:solo";
const GROUPS_KEY = "leaderboard:groups";

// ---------------------------------------------------------------------------
// updateSoloLeaderboard
// Recomputes a single user's all-time completed tree count (stage=4) and
// writes it to the leaderboard:solo sorted set via ZADD.
//
// Called from midnightReset after streak update so the leaderboard reflects
// the freshly-finalised tree.
//
// Privacy handling: If user has isPrivate=true, removes them from leaderboard.
// If isPrivate=false, adds/updates their score.
// ---------------------------------------------------------------------------
export async function updateSoloLeaderboard(userId: string): Promise<void> {
  // Fetch user's privacy setting
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPrivate: true },
  });

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  // If user is private, remove from leaderboard and return early
  if (user.isPrivate) {
    await redis.zrem(SOLO_KEY, userId);
    return;
  }

  // User is public — count completed trees and add/update their score
  const count = await prisma.dailyTree.count({
    where: { userId, stage: 4 },
  });

  // ZADD with NX would skip existing, so we always overwrite with the latest count
  await redis.zadd(SOLO_KEY, { score: count, member: userId });
}

// ---------------------------------------------------------------------------
// updateGroupsLeaderboard
// Recomputes all group forest sizes and rewrites them in one pass.
// This is called once per midnight batch (not per user) because group
// membership can change at any time and a full recompute is simplest.
// ---------------------------------------------------------------------------
export async function updateGroupsLeaderboard(): Promise<void> {
  const groups = await prisma.group.findMany({
    select: { id: true },
  });

  if (groups.length === 0) return;

  // For each group, count completed trees across all current members
  const zaddArgs: { score: number; member: string }[] = [];

  for (const group of groups) {
    const members = await prisma.groupMember.findMany({
      where: { groupId: group.id },
      select: { userId: true },
    });

    const memberIds = members.map((m) => m.userId);

    const count =
      memberIds.length > 0
        ? await prisma.dailyTree.count({
            where: { userId: { in: memberIds }, stage: 4 },
          })
        : 0;

    zaddArgs.push({ score: count, member: group.id });
  }

  // ZADD each group — using Promise.all for parallel writes
  if (zaddArgs.length > 0) {
    await Promise.all(
      zaddArgs.map((arg) => redis.zadd(GROUPS_KEY, { score: arg.score, member: arg.member }))
    );
  }
}

// ---------------------------------------------------------------------------
// getSoloLeaderboard
// Returns a ranked list of users from the leaderboard:solo sorted set.
// Pagination: page (1-indexed) × limit.
// ---------------------------------------------------------------------------
export type SoloLeaderboardEntry = {
  rank: number;
  userId: string;
  name: string;
  totalTrees: number;
  currentStreak: number;
};

export async function getSoloLeaderboard(
  page: number,
  limit: number,
  scope: string
): Promise<SoloLeaderboardEntry[]> {
  // Handle "none" scope
  if (scope === "none") {
    return [];
  }

  const start = (page - 1) * limit;
  const end = start + limit - 1;

  // ZRANGE in reverse order (highest score first) with scores
  const raw = await redis.zrange(SOLO_KEY, start, end, {
    rev: true,
    withScores: true,
  });

  if (!raw || raw.length === 0) return [];

  // raw is an array alternating: [member, score, member, score, ...]
  // when withScores:true in @upstash/redis it returns tuples OR a flat array
  // The @upstash/redis client returns an array of { member, score } objects
  // when withScores is true.
  const entries = raw as { member: string; score: number }[];

  // Filter out any invalid entries (undefined member or score)
  const validEntries = entries.filter(
    (e) => e && e.member !== undefined && e.member !== null && typeof e.score === 'number'
  );

  if (validEntries.length === 0) return [];

  const userIds = validEntries.map((e) => e.member);

  // Batch-fetch user profile + streak, filtering out private users
  const users = await prisma.user.findMany({
    where: { 
      id: { in: userIds },
      isPrivate: false
    },
    select: {
      id: true,
      name: true,
      streak: { select: { currentStreak: true } },
    },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  // Only include users that passed the privacy filter and recalculate ranks
  const filtered = validEntries
    .filter(entry => userMap.has(entry.member))
    .map((entry, idx) => {
      const user = userMap.get(entry.member)!;
      return {
        rank: start + idx + 1,
        userId: entry.member,
        name: user.name,
        totalTrees: entry.score,
        currentStreak: user.streak?.currentStreak ?? 0,
      };
    });

  return filtered;
}

// ---------------------------------------------------------------------------
// getGroupsLeaderboard
// Returns ranked groups from leaderboard:groups sorted set.
// ---------------------------------------------------------------------------
export type GroupLeaderboardEntry = {
  rank: number;
  groupId: string;
  name: string;
  totalTrees: number;
  memberCount: number;
};

export async function getGroupsLeaderboard(
  page: number,
  limit: number
): Promise<GroupLeaderboardEntry[]> {
  const start = (page - 1) * limit;
  const end = start + limit - 1;

  const raw = await redis.zrange(GROUPS_KEY, start, end, {
    rev: true,
    withScores: true,
  });

  if (!raw || raw.length === 0) return [];

  const entries = raw as { member: string; score: number }[];

  // Filter out any invalid entries (undefined member or score)
  const validEntries = entries.filter(
    (e) => e && e.member !== undefined && e.member !== null && typeof e.score === 'number'
  );

  if (validEntries.length === 0) return [];

  const groupIds = validEntries.map((e) => e.member);

  const groups = await prisma.group.findMany({
    where: { id: { in: groupIds } },
    select: {
      id: true,
      name: true,
      memberCount: true,
    },
  });

  const groupMap = new Map(groups.map((g) => [g.id, g]));

  return validEntries.map((entry, idx) => {
    const group = groupMap.get(entry.member);
    return {
      rank: start + idx + 1,
      groupId: entry.member,
      name: group?.name ?? "Unknown",
      totalTrees: entry.score,
      memberCount: group?.memberCount ?? 0,
    };
  });
}
