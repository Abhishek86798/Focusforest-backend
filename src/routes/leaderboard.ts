import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { apiError } from "../lib/apiError";
import { getSoloLeaderboard, getGroupsLeaderboard } from "../services/leaderboardService";

const router = Router();

// ---------------------------------------------------------------------------
// Shared query schema — ?scope=global|none&page=1&limit=20
// ---------------------------------------------------------------------------
const leaderboardQuerySchema = z.object({
  scope: z.enum(["global", "none"]).default("global"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// GET /api/v1/leaderboard/solo
// Global solo leaderboard ranked by all-time completed trees (stage=4).
// Returns: rank, userId, name, totalTrees, currentStreak
// ---------------------------------------------------------------------------
router.get(
  "/solo",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const query = leaderboardQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json(apiError("VALIDATION_ERROR", "Invalid query parameters."));
      return;
    }

    const { scope, page, limit } = query.data;
    const entries = await getSoloLeaderboard(page, limit, scope);
    res.json({ leaderboard: entries, page, limit });
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/leaderboard/groups
// Global groups leaderboard ranked by combined completed trees.
// Returns: rank, groupId, name, totalTrees, memberCount
// ---------------------------------------------------------------------------
router.get(
  "/groups",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const query = leaderboardQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json(apiError("VALIDATION_ERROR", "Invalid query parameters."));
      return;
    }

    const { page, limit } = query.data;
    const entries = await getGroupsLeaderboard(page, limit);
    res.json({ leaderboard: entries, page, limit });
  }
);

export default router;
