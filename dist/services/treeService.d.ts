export interface TreeState {
    stage: number;
    glowLevel: number;
    stageProgress: number;
    totalSessions: number;
    sessionsWithTask: number;
}
export declare function upsertDailyTree(userId: string, stageProgressDelta: number, taskStatus: "completed" | "carried" | "none"): Promise<TreeState>;
//# sourceMappingURL=treeService.d.ts.map