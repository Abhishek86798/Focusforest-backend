export declare function createGroup(userId: string, name: string): Promise<{
    id: string;
    name: string;
    createdAt: Date;
    adminUserId: string;
    inviteCode: string;
    memberCount: number;
}>;
export type JoinGroupError = {
    code: "INVALID_INVITE_CODE";
} | {
    code: "ALREADY_MEMBER";
} | {
    code: "GROUP_FULL";
};
export type JoinGroupResult = {
    ok: true;
    group: {
        id: string;
        name: string;
        memberCount: number;
    };
} | {
    ok: false;
    error: JoinGroupError;
};
export declare function joinGroup(userId: string, inviteCode: string): Promise<JoinGroupResult>;
export type GetGroupError = {
    code: "GROUP_NOT_FOUND";
} | {
    code: "FORBIDDEN";
};
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
    forestStats: {
        totalCompletedTrees: number;
    };
};
export type GetGroupResult = {
    ok: true;
    group: GroupDetails;
} | {
    ok: false;
    error: GetGroupError;
};
export declare function getGroupDetails(groupId: string, requestingUserId: string): Promise<GetGroupResult>;
export type CalendarDayMember = {
    userId: string;
    name: string;
    stage: number;
    totalSessions: number;
    currentStreak: number;
};
export type CalendarDay = {
    date: string;
    members: CalendarDayMember[];
};
export type GetGroupCalendarResult = {
    ok: true;
    days: CalendarDay[];
} | {
    ok: false;
    error: GetGroupError;
};
export declare function getGroupCalendar(groupId: string, requestingUserId: string, month?: number, year?: number): Promise<GetGroupCalendarResult>;
export type RemoveMemberError = {
    code: "GROUP_NOT_FOUND";
} | {
    code: "FORBIDDEN";
} | {
    code: "NOT_FOUND";
};
export type RemoveMemberResult = {
    ok: true;
} | {
    ok: false;
    error: RemoveMemberError;
};
export declare function removeMember(groupId: string, targetUserId: string, requestingUserId: string): Promise<RemoveMemberResult>;
export type UserGroupSummary = {
    id: string;
    name: string;
    description: string | null;
    memberCount: number;
    activeMemberCount: number;
    isAdmin: boolean;
};
export declare function getUserGroups(userId: string): Promise<UserGroupSummary[]>;
export type GroupStats = {
    totalMinutes: number;
    treesCompleted: number;
    sessions: number;
    todayTreeCount: number;
};
export type GetGroupStatsError = {
    code: "GROUP_NOT_FOUND";
} | {
    code: "NOT_GROUP_MEMBER";
};
export type GetGroupStatsResult = {
    ok: true;
    stats: GroupStats;
} | {
    ok: false;
    error: GetGroupStatsError;
};
export declare function getGroupStats(groupId: string, requestingUserId: string): Promise<GetGroupStatsResult>;
export type MemberStatus = {
    userId: string;
    name: string;
    avatarUrl: string | null;
    status: "focus_session" | "afk";
    personalStreak: number;
    contribution: number;
};
export type GetMemberStatusError = {
    code: "GROUP_NOT_FOUND";
} | {
    code: "NOT_GROUP_MEMBER";
};
export type GetMemberStatusResult = {
    ok: true;
    members: MemberStatus[];
} | {
    ok: false;
    error: GetMemberStatusError;
};
export declare function getMemberStatus(groupId: string, requestingUserId: string): Promise<GetMemberStatusResult>;
export type DeleteGroupError = {
    code: "GROUP_NOT_FOUND";
} | {
    code: "NOT_GROUP_ADMIN";
};
export type DeleteGroupResult = {
    ok: true;
} | {
    ok: false;
    error: DeleteGroupError;
};
export declare function deleteGroup(groupId: string, requestingUserId: string): Promise<DeleteGroupResult>;
//# sourceMappingURL=groupService.d.ts.map