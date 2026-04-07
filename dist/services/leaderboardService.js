"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSoloLeaderboard = updateSoloLeaderboard;
exports.updateGroupsLeaderboard = updateGroupsLeaderboard;
exports.getSoloLeaderboard = getSoloLeaderboard;
exports.getGroupsLeaderboard = getGroupsLeaderboard;
const redis_1 = require("../lib/redis");
const prisma_1 = require("../lib/prisma");
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
async function updateSoloLeaderboard(userId) {
    // Fetch user's privacy setting
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: { isPrivate: true },
    });
    if (!user) {
        throw new Error(`User ${userId} not found`);
    }
    // If user is private, remove from leaderboard and return early
    if (user.isPrivate) {
        await redis_1.redis.zrem(SOLO_KEY, userId);
        return;
    }
    // User is public — count completed trees and add/update their score
    const count = await prisma_1.prisma.dailyTree.count({
        where: { userId, stage: 4 },
    });
    // ZADD with NX would skip existing, so we always overwrite with the latest count
    await redis_1.redis.zadd(SOLO_KEY, { score: count, member: userId });
}
// ---------------------------------------------------------------------------
// updateGroupsLeaderboard
// Recomputes all group forest sizes and rewrites them in one pass.
// This is called once per midnight batch (not per user) because group
// membership can change at any time and a full recompute is simplest.
// ---------------------------------------------------------------------------
async function updateGroupsLeaderboard() {
    const groups = await prisma_1.prisma.group.findMany({
        select: { id: true },
    });
    if (groups.length === 0)
        return;
    // For each group, count completed trees across all current members
    const zaddArgs = [];
    for (const group of groups) {
        const members = await prisma_1.prisma.groupMember.findMany({
            where: { groupId: group.id },
            select: { userId: true },
        });
        const memberIds = members.map((m) => m.userId);
        const count = memberIds.length > 0
            ? await prisma_1.prisma.dailyTree.count({
                where: { userId: { in: memberIds }, stage: 4 },
            })
            : 0;
        zaddArgs.push({ score: count, member: group.id });
    }
    // ZADD each group — using Promise.all for parallel writes
    if (zaddArgs.length > 0) {
        await Promise.all(zaddArgs.map((arg) => redis_1.redis.zadd(GROUPS_KEY, { score: arg.score, member: arg.member })));
    }
}
async function getSoloLeaderboard(page, limit, scope) {
    // Handle "none" scope
    if (scope === "none") {
        return [];
    }
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    // ZRANGE in reverse order (highest score first) with scores
    const raw = await redis_1.redis.zrange(SOLO_KEY, start, end, {
        rev: true,
        withScores: true,
    });
    if (!raw || raw.length === 0)
        return [];
    // raw is an array alternating: [member, score, member, score, ...]
    // when withScores:true in @upstash/redis it returns tuples OR a flat array
    // The @upstash/redis client returns an array of { member, score } objects
    // when withScores is true.
    const entries = raw;
    // Filter out any invalid entries (undefined member or score)
    const validEntries = entries.filter((e) => e && e.member !== undefined && e.member !== null && typeof e.score === 'number');
    if (validEntries.length === 0)
        return [];
    const userIds = validEntries.map((e) => e.member);
    // Batch-fetch user profile + streak, filtering out private users
    const users = await prisma_1.prisma.user.findMany({
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
        const user = userMap.get(entry.member);
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
async function getGroupsLeaderboard(page, limit) {
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    const raw = await redis_1.redis.zrange(GROUPS_KEY, start, end, {
        rev: true,
        withScores: true,
    });
    if (!raw || raw.length === 0)
        return [];
    const entries = raw;
    // Filter out any invalid entries (undefined member or score)
    const validEntries = entries.filter((e) => e && e.member !== undefined && e.member !== null && typeof e.score === 'number');
    if (validEntries.length === 0)
        return [];
    const groupIds = validEntries.map((e) => e.member);
    const groups = await prisma_1.prisma.group.findMany({
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
//# sourceMappingURL=leaderboardService.js.map