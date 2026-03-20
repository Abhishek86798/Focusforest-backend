export type TaskStatus = "completed" | "carried" | "none";
export interface ScoreInput {
    focusMinutes: number;
    taskStatus: TaskStatus;
}
export interface ScoreResult {
    stageProgress: number;
    taskMultiplier: number;
}
export declare function computeStageProgress(input: ScoreInput): ScoreResult;
//# sourceMappingURL=scoreEngine.d.ts.map