"use strict";
// Score engine — RUNS SERVER-SIDE ONLY. Never expose this formula to the client.
//
// Formula (from PRD section 3.4):
//   stageProgress = (focusMinutes / 25) × taskMultiplier
//
//   taskMultiplier:
//     completed → 1.5
//     carried   → 1.0
//     none      → 1.0
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeStageProgress = computeStageProgress;
function computeStageProgress(input) {
    const taskMultiplier = input.taskStatus === "completed" ? 1.5 : 1.0;
    const stageProgress = (input.focusMinutes / 25) * taskMultiplier;
    // Round to 2 decimal places to avoid floating point drift in the DB
    return {
        stageProgress: Math.round(stageProgress * 100) / 100,
        taskMultiplier,
    };
}
//# sourceMappingURL=scoreEngine.js.map