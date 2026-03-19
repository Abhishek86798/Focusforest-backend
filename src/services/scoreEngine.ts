// Score engine — RUNS SERVER-SIDE ONLY. Never expose this formula to the client.
//
// Formula (from PRD section 3.4):
//   stageProgress = (focusMinutes / 25) × taskMultiplier
//
//   taskMultiplier:
//     completed → 1.5
//     carried   → 1.0
//     none      → 1.0

export type TaskStatus = "completed" | "carried" | "none";

export interface ScoreInput {
  focusMinutes: number;
  taskStatus: TaskStatus;
}

export interface ScoreResult {
  stageProgress: number;
  taskMultiplier: number;
}

export function computeStageProgress(input: ScoreInput): ScoreResult {
  const taskMultiplier = input.taskStatus === "completed" ? 1.5 : 1.0;
  const stageProgress = (input.focusMinutes / 25) * taskMultiplier;

  // Round to 2 decimal places to avoid floating point drift in the DB
  return {
    stageProgress: Math.round(stageProgress * 100) / 100,
    taskMultiplier,
  };
}
