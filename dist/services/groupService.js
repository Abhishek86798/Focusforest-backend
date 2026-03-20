"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGroup = createGroup;
exports.joinGroup = joinGroup;
exports.getGroupDetails = getGroupDetails;
exports.getGroupCalendar = getGroupCalendar;
exports.removeMember = removeMember;
const prisma_1 = require("../lib/prisma");
// ---------------------------------------------------------------------------
// generateInviteCode
// Generates a unique 6-character alphanumeric invite code (A-Z, 0-9).
// Retries until a code that doesn't already exist in the DB is found.
// ---------------------------------------------------------------------------
const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
async function generateInviteCode() {
    for (let attempt = 0; attempt < 10; attempt++) {
        const code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
        const existing = await prisma_1.prisma.group.findUnique({ where: { inviteCode: code } });
        if (!existing)
            return code;
    }
    throw new Error("Failed to generate a unique invite code after 10 attempts.");
}
// ---------------------------------------------------------------------------
// createGroup
// Creates a new group and adds the creating user as the first member.
// Returns the created group record.
// ---------------------------------------------------------------------------
async function createGroup(userId, name) {
    const inviteCode = await generateInviteCode();
    const group = await prisma_1.prisma.$transaction(async (tx) => {
        const newGroup = await tx.group.create({
            data: {
                name,
                adminUserId: userId,
                inviteCode,
                memberCount: 1,
            },
        });
        await tx.groupMember.create({
            data: {
                groupId: newGroup.id,
                userId,
            },
        });
        return newGroup;
    });
    return group;
}
async function joinGroup(userId, inviteCode) {
    const group = await prisma_1.prisma.group.findUnique({ where: { inviteCode } });
    if (!group) {
        return { ok: false, error: { code: "INVALID_INVITE_CODE" } };
    }
    // Check if already a member
    const existing = await prisma_1.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId } },
    });
    if (existing) {
        return { ok: false, error: { code: "ALREADY_MEMBER" } };
    }
    // Check capacity (max 5 members)
    if (group.memberCount >= 5) {
        return { ok: false, error: { code: "GROUP_FULL" } };
    }
    // Add member and increment count atomically
    await prisma_1.prisma.$transaction([
        prisma_1.prisma.groupMember.create({ data: { groupId: group.id, userId } }),
        prisma_1.prisma.group.update({
            where: { id: group.id },
            data: { memberCount: { increment: 1 } },
        }),
    ]);
    const updated = await prisma_1.prisma.group.findUniqueOrThrow({
        where: { id: group.id },
        select: { id: true, name: true, memberCount: true },
    });
    return { ok: true, group: updated };
}
async function getGroupDetails(groupId, requestingUserId) {
    const group = await prisma_1.prisma.group.findUnique({
        where: { id: groupId },
        include: {
            members: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            avatarUrl: true,
                            streak: { select: { currentStreak: true } },
                        },
                    },
                },
                orderBy: { joinedAt: "asc" },
            },
        },
    });
    if (!group) {
        return { ok: false, error: { code: "GROUP_NOT_FOUND" } };
    }
    // Auth guard: requester must be a member
    const isMember = group.members.some((m) => m.userId === requestingUserId);
    if (!isMember) {
        return { ok: false, error: { code: "FORBIDDEN" } };
    }
    // Collect all member user IDs for forest stats query
    const memberUserIds = group.members.map((m) => m.userId);
    // Count all daily_trees at stage=4 across members (all time)
    const totalCompletedTrees = await prisma_1.prisma.dailyTree.count({
        where: {
            userId: { in: memberUserIds },
            stage: 4,
        },
    });
    const members = group.members.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        currentStreak: m.user.streak?.currentStreak ?? 0,
        joinedAt: m.joinedAt,
    }));
    return {
        ok: true,
        group: {
            id: group.id,
            name: group.name,
            inviteCode: group.inviteCode,
            memberCount: group.memberCount,
            adminUserId: group.adminUserId,
            createdAt: group.createdAt,
            members,
            forestStats: { totalCompletedTrees },
        },
    };
}
async function getGroupCalendar(groupId, requestingUserId, month, year) {
    // Fetch group and members
    const group = await prisma_1.prisma.group.findUnique({
        where: { id: groupId },
        include: {
            members: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            streak: { select: { currentStreak: true } },
                        },
                    },
                },
            },
        },
    });
    if (!group) {
        return { ok: false, error: { code: "GROUP_NOT_FOUND" } };
    }
    const isMember = group.members.some((m) => m.userId === requestingUserId);
    if (!isMember) {
        return { ok: false, error: { code: "FORBIDDEN" } };
    }
    const memberUserIds = group.members.map((m) => m.userId);
    // Build date range filter
    let dateFilter;
    if (month !== undefined && year !== undefined) {
        const start = new Date(Date.UTC(year, month - 1, 1));
        const end = new Date(Date.UTC(year, month, 0)); // last day of the month
        dateFilter = { gte: start, lte: end };
    }
    else if (year !== undefined) {
        dateFilter = {
            gte: new Date(Date.UTC(year, 0, 1)),
            lte: new Date(Date.UTC(year, 11, 31)),
        };
    }
    // Fetch all relevant daily_trees for all members
    const trees = await prisma_1.prisma.dailyTree.findMany({
        where: {
            userId: { in: memberUserIds },
            ...(dateFilter ? { date: dateFilter } : {}),
        },
        orderBy: { date: "asc" },
        select: {
            userId: true,
            date: true,
            stage: true,
            totalSessions: true,
        },
    });
    // Build a lookup for member info (userId → { name, currentStreak })
    const memberInfoMap = new Map(group.members.map((m) => [
        m.userId,
        {
            name: m.user.name,
            currentStreak: m.user.streak?.currentStreak ?? 0,
        },
    ]));
    // Pivot trees by date
    const dayMap = new Map();
    for (const tree of trees) {
        const dateStr = tree.date.toISOString().slice(0, 10);
        const info = memberInfoMap.get(tree.userId);
        if (!info)
            continue;
        if (!dayMap.has(dateStr)) {
            dayMap.set(dateStr, []);
        }
        dayMap.get(dateStr).push({
            userId: tree.userId,
            name: info.name,
            stage: tree.stage,
            totalSessions: tree.totalSessions,
            currentStreak: info.currentStreak,
        });
    }
    // Sort days descending (most recent first), members stable within each day
    const days = Array.from(dayMap.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, members]) => ({ date, members }));
    return { ok: true, days };
}
async function removeMember(groupId, targetUserId, requestingUserId) {
    const group = await prisma_1.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
        return { ok: false, error: { code: "GROUP_NOT_FOUND" } };
    }
    const isSelf = requestingUserId === targetUserId;
    const isAdmin = group.adminUserId === requestingUserId;
    // Only self or admin can remove
    if (!isSelf && !isAdmin) {
        return { ok: false, error: { code: "FORBIDDEN" } };
    }
    // Check target is actually a member
    const membership = await prisma_1.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: targetUserId } },
    });
    if (!membership) {
        return { ok: false, error: { code: "NOT_FOUND" } };
    }
    // Delete member row and decrement count atomically
    await prisma_1.prisma.$transaction([
        prisma_1.prisma.groupMember.delete({
            where: { groupId_userId: { groupId, userId: targetUserId } },
        }),
        prisma_1.prisma.group.update({
            where: { id: groupId },
            data: { memberCount: { decrement: 1 } },
        }),
    ]);
    return { ok: true };
}
//# sourceMappingURL=groupService.js.map