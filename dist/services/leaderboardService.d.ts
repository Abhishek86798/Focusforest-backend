export declare function updateSoloLeaderboard(userId: string): Promise<void>;
export declare function updateGroupsLeaderboard(): Promise<void>;
export type SoloLeaderboardEntry = {
    rank: number;
    userId: string;
    name: string;
    totalTrees: number;
    currentStreak: number;
};
export declare function getSoloLeaderboard(page: number, limit: number, scope: string): Promise<SoloLeaderboardEntry[]>;
export type GroupLeaderboardEntry = {
    rank: number;
    groupId: string;
    name: string;
    totalTrees: number;
    memberCount: number;
};
export declare function getGroupsLeaderboard(page: number, limit: number): Promise<GroupLeaderboardEntry[]>;
//# sourceMappingURL=leaderboardService.d.ts.map