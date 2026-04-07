import { prisma } from "../lib/prisma";

// ---------------------------------------------------------------------------
// generateInviteCode
// Generates a unique 6-character alphanumeric invite code (A-Z, 0-9).
// Retries until a code that doesn't already exist in the DB is found.
// ---------------------------------------------------------------------------
const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

async function generateInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Array.from({ length: 6 }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join("");

    const existing = await prisma.group.findUnique({ where: { inviteCode: code } });
    if (!existing) return code;
  }
  throw new Error("Failed to generate a unique invite code after 10 attempts.");
}

// ---------------------------------------------------------------------------
// createGroup
// Creates a new group and adds the creating user as the first member.
// Returns the created group record.
// ---------------------------------------------------------------------------
export async function createGroup(userId: string, name: string) {
  const inviteCode = await generateInviteCode();

  const group = await prisma.$transaction(async (tx) => {
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

// ---------------------------------------------------------------------------
// joinGroup
// Validates the invite code and adds the user as a member.
// Business rules:
//   - 404 if invite code not found
//   - 409 if user is already a member
//   - 403 if group is already at max capacity (5 members)
// ---------------------------------------------------------------------------
export type JoinGroupError =
  | { code: "INVALID_INVITE_CODE" }
  | { code: "ALREADY_MEMBER" }
  | { code: "GROUP_FULL" };

export type JoinGroupResult =
  | { ok: true; group: { id: string; name: string; memberCount: number } }
  | { ok: false; error: JoinGroupError };

export async function joinGroup(userId: string, inviteCode: string): Promise<JoinGroupResult> {
  const group = await prisma.group.findUnique({ where: { inviteCode } });

  if (!group) {
    return { ok: false, error: { code: "INVALID_INVITE_CODE" } };
  }

  // Check if already a member
  const existing = await prisma.groupMember.findUnique({
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
  await prisma.$transaction([
    prisma.groupMember.create({ data: { groupId: group.id, userId } }),
    prisma.group.update({
      where: { id: group.id },
      data: { memberCount: { increment: 1 } },
    }),
  ]);

  const updated = await prisma.group.findUniqueOrThrow({
    where: { id: group.id },
    select: { id: true, name: true, memberCount: true },
  });

  return { ok: true, group: updated };
}

// ---------------------------------------------------------------------------
// getGroupDetails
// Returns group info + member list + forest stats.
// 404 if group not found. 403 if requesting user is not a member.
// Forest stats: count of daily_trees with stage=4 across all current members.
// ---------------------------------------------------------------------------
export type GetGroupError =
  | { code: "GROUP_NOT_FOUND" }
  | { code: "FORBIDDEN" };

export type GroupMemberDetail = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  currentStreak: number;
  joinedAt: Date;
};

export type GroupDetails = {
  id: string;
  name: string;
  inviteCode: string;
  memberCount: number;
  adminUserId: string;
  createdAt: Date;
  members: GroupMemberDetail[];
  forestStats: { totalCompletedTrees: number };
};

export type GetGroupResult =
  | { ok: true; group: GroupDetails }
  | { ok: false; error: GetGroupError };

export async function getGroupDetails(
  groupId: string,
  requestingUserId: string
): Promise<GetGroupResult> {
  const group = await prisma.group.findUnique({
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
  const totalCompletedTrees = await prisma.dailyTree.count({
    where: {
      userId: { in: memberUserIds },
      stage: 4,
    },
  });

  const members: GroupMemberDetail[] = group.members.map((m) => ({
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

// ---------------------------------------------------------------------------
// getGroupCalendar
// Returns the group's collective daily output per member.
// Each day shows every member who had a daily_tree row that day.
// 404 if group not found. 403 if requesting user is not a member.
// ---------------------------------------------------------------------------
export type CalendarDayMember = {
  userId: string;
  name: string;
  stage: number;
  totalSessions: number;
  currentStreak: number;
};

export type CalendarDay = {
  date: string; // "YYYY-MM-DD"
  members: CalendarDayMember[];
};

export type GetGroupCalendarResult =
  | { ok: true; days: CalendarDay[] }
  | { ok: false; error: GetGroupError };

export async function getGroupCalendar(
  groupId: string,
  requestingUserId: string,
  month?: number,
  year?: number
): Promise<GetGroupCalendarResult> {
  // Fetch group and members
  const group = await prisma.group.findUnique({
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
  let dateFilter: { gte?: Date; lte?: Date } | undefined;
  if (month !== undefined && year !== undefined) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0)); // last day of the month
    dateFilter = { gte: start, lte: end };
  } else if (year !== undefined) {
    dateFilter = {
      gte: new Date(Date.UTC(year, 0, 1)),
      lte: new Date(Date.UTC(year, 11, 31)),
    };
  }

  // Fetch all relevant daily_trees for all members
  const trees = await prisma.dailyTree.findMany({
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
  const memberInfoMap = new Map(
    group.members.map((m) => [
      m.userId,
      {
        name: m.user.name,
        currentStreak: m.user.streak?.currentStreak ?? 0,
      },
    ])
  );

  // Pivot trees by date
  const dayMap = new Map<string, CalendarDayMember[]>();

  for (const tree of trees) {
    const dateStr = tree.date.toISOString().slice(0, 10);
    const info = memberInfoMap.get(tree.userId);
    if (!info) continue;

    if (!dayMap.has(dateStr)) {
      dayMap.set(dateStr, []);
    }

    dayMap.get(dateStr)!.push({
      userId: tree.userId,
      name: info.name,
      stage: tree.stage,
      totalSessions: tree.totalSessions,
      currentStreak: info.currentStreak,
    });
  }

  // Sort days descending (most recent first), members stable within each day
  const days: CalendarDay[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, members]) => ({ date, members }));

  return { ok: true, days };
}

// ---------------------------------------------------------------------------
// removeMember
// Self-leave (always allowed) OR admin removes another member.
// Returns error codes for route handler to map to HTTP status.
// ---------------------------------------------------------------------------
export type RemoveMemberError =
  | { code: "GROUP_NOT_FOUND" }
  | { code: "FORBIDDEN" }
  | { code: "NOT_FOUND" }; // target is not a member

export type RemoveMemberResult =
  | { ok: true }
  | { ok: false; error: RemoveMemberError };

export async function removeMember(
  groupId: string,
  targetUserId: string,
  requestingUserId: string
): Promise<RemoveMemberResult> {
  const group = await prisma.group.findUnique({ where: { id: groupId } });

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
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });

  if (!membership) {
    return { ok: false, error: { code: "NOT_FOUND" } };
  }

  // Delete member row and decrement count atomically
  await prisma.$transaction([
    prisma.groupMember.delete({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    }),
    prisma.group.update({
      where: { id: groupId },
      data: { memberCount: { decrement: 1 } },
    }),
  ]);

  return { ok: true };
}

// ---------------------------------------------------------------------------
// getUserGroups
// Returns all groups the authenticated user belongs to (for sidebar list).
// Includes activeMemberCount (members with sessions today) and isAdmin flag.
// ---------------------------------------------------------------------------
export type UserGroupSummary = {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  activeMemberCount: number;
  isAdmin: boolean;
};

export async function getUserGroups(userId: string): Promise<UserGroupSummary[]> {
  // Fetch all groups where user is a member
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          memberCount: true,
          adminUserId: true,
          createdAt: true,
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  // For each group, calculate activeMemberCount
  const groups: UserGroupSummary[] = [];

  for (const membership of memberships) {
    const group = membership.group;

    // Get all member IDs for this group
    const allMembers = await prisma.groupMember.findMany({
      where: { groupId: group.id },
      select: { userId: true, user: { select: { utcOffset: true } } },
    });

    // Calculate today's date for each member based on their timezone
    const now = new Date();
    let activeMemberCount = 0;

    for (const member of allMembers) {
      const offsetMinutes = member.user.utcOffset;
      const localDate = new Date(now.getTime() + offsetMinutes * 60 * 1000);
      const todayDateStr = localDate.toISOString().split("T")[0];
      const todayDate = new Date(todayDateStr + "T00:00:00.000Z");

      // Check if this member has a daily_trees row for today with totalSessions > 0
      const todayTree = await prisma.dailyTree.findUnique({
        where: {
          userId_date: {
            userId: member.userId,
            date: todayDate,
          },
        },
        select: { totalSessions: true },
      });

      if (todayTree && todayTree.totalSessions > 0) {
        activeMemberCount++;
      }
    }

    groups.push({
      id: group.id,
      name: group.name,
      description: null, // Not in schema yet, placeholder for future
      memberCount: group.memberCount,
      activeMemberCount,
      isAdmin: group.adminUserId === userId,
    });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// getGroupStats
// Returns aggregate stat tiles for the selected group.
// Guard: user must be a member.
// ---------------------------------------------------------------------------
export type GroupStats = {
  totalMinutes: number;
  treesCompleted: number;
  sessions: number;
  todayTreeCount: number;
};

export type GetGroupStatsError =
  | { code: "GROUP_NOT_FOUND" }
  | { code: "NOT_GROUP_MEMBER" };

export type GetGroupStatsResult =
  | { ok: true; stats: GroupStats }
  | { ok: false; error: GetGroupStatsError };

export async function getGroupStats(
  groupId: string,
  requestingUserId: string
): Promise<GetGroupStatsResult> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        select: { userId: true, user: { select: { utcOffset: true } } },
      },
    },
  });

  if (!group) {
    return { ok: false, error: { code: "GROUP_NOT_FOUND" } };
  }

  // Auth guard: requester must be a member
  const isMember = group.members.some((m) => m.userId === requestingUserId);
  if (!isMember) {
    return { ok: false, error: { code: "NOT_GROUP_MEMBER" } };
  }

  const memberUserIds = group.members.map((m) => m.userId);

  // totalMinutes — sum of focus_minutes for completed sessions
  const totalMinutesResult = await prisma.session.aggregate({
    where: {
      userId: { in: memberUserIds },
      state: "completed",
    },
    _sum: { focusMinutes: true },
  });
  const totalMinutes = totalMinutesResult._sum.focusMinutes ?? 0;

  // treesCompleted — count of daily_trees with stage = 4
  const treesCompleted = await prisma.dailyTree.count({
    where: {
      userId: { in: memberUserIds },
      stage: 4,
    },
  });

  // sessions — count of all completed sessions
  const sessions = await prisma.session.count({
    where: {
      userId: { in: memberUserIds },
      state: "completed",
    },
  });

  // todayTreeCount — count of members with stage >= 1 for today
  const now = new Date();
  let todayTreeCount = 0;

  for (const member of group.members) {
    const offsetMinutes = member.user.utcOffset;
    const localDate = new Date(now.getTime() + offsetMinutes * 60 * 1000);
    const todayDateStr = localDate.toISOString().split("T")[0];
    const todayDate = new Date(todayDateStr + "T00:00:00.000Z");

    const todayTree = await prisma.dailyTree.findUnique({
      where: {
        userId_date: {
          userId: member.userId,
          date: todayDate,
        },
      },
      select: { stage: true },
    });

    if (todayTree && todayTree.stage >= 1) {
      todayTreeCount++;
    }
  }

  return {
    ok: true,
    stats: {
      totalMinutes,
      treesCompleted,
      sessions,
      todayTreeCount,
    },
  };
}

// ---------------------------------------------------------------------------
// getMemberStatus
// Returns real-time member status for the Members table.
// Guard: user must be a member.
// ---------------------------------------------------------------------------
export type MemberStatus = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  status: "focus_session" | "afk";
  personalStreak: number;
  contribution: number;
};

export type GetMemberStatusError =
  | { code: "GROUP_NOT_FOUND" }
  | { code: "NOT_GROUP_MEMBER" };

export type GetMemberStatusResult =
  | { ok: true; members: MemberStatus[] }
  | { ok: false; error: GetMemberStatusError };

export async function getMemberStatus(
  groupId: string,
  requestingUserId: string
): Promise<GetMemberStatusResult> {
  const group = await prisma.group.findUnique({
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
    return { ok: false, error: { code: "NOT_GROUP_MEMBER" } };
  }

  const members: MemberStatus[] = [];

  for (const member of group.members) {
    const userId = member.user.id;

    // Check if user has an active session
    const activeSession = await prisma.session.findFirst({
      where: {
        userId,
        state: "active",
      },
    });

    const status: "focus_session" | "afk" = activeSession ? "focus_session" : "afk";

    // Get contribution (total focus minutes for completed sessions)
    const contributionResult = await prisma.session.aggregate({
      where: {
        userId,
        state: "completed",
      },
      _sum: { focusMinutes: true },
    });
    const contribution = contributionResult._sum.focusMinutes ?? 0;

    members.push({
      userId,
      name: member.user.name,
      avatarUrl: member.user.avatarUrl,
      status,
      personalStreak: member.user.streak?.currentStreak ?? 0,
      contribution,
    });
  }

  return { ok: true, members };
}

// ---------------------------------------------------------------------------
// deleteGroup
// Admin-only: deletes the entire group and all members.
// ---------------------------------------------------------------------------
export type DeleteGroupError =
  | { code: "GROUP_NOT_FOUND" }
  | { code: "NOT_GROUP_ADMIN" };

export type DeleteGroupResult =
  | { ok: true }
  | { ok: false; error: DeleteGroupError };

export async function deleteGroup(
  groupId: string,
  requestingUserId: string
): Promise<DeleteGroupResult> {
  const group = await prisma.group.findUnique({ where: { id: groupId } });

  if (!group) {
    return { ok: false, error: { code: "GROUP_NOT_FOUND" } };
  }

  // Only admin can delete
  if (group.adminUserId !== requestingUserId) {
    return { ok: false, error: { code: "NOT_GROUP_ADMIN" } };
  }

  // Delete group_members first (foreign key constraint), then group
  await prisma.$transaction([
    prisma.groupMember.deleteMany({ where: { groupId } }),
    prisma.group.delete({ where: { id: groupId } }),
  ]);

  return { ok: true };
}
