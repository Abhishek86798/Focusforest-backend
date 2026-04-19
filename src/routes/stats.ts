/**
 * Stats Routes
 * 
 * Provides authenticated endpoints for retrieving user statistics and streak information.
 * All endpoints require authentication via Bearer token in Authorization header.
 * 
 * Endpoints:
 * - GET /api/v1/stats/summary - Returns aggregate statistics for the authenticated user
 * - GET /api/v1/stats/streak - Returns streak information for the authenticated user
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { apiError } from "../lib/apiError";
import { getSummaryStats, getStreakStats } from "../services/statsService";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/stats/summary
// Returns aggregate statistics for the authenticated user.
// No request body or query params needed.
// ---------------------------------------------------------------------------
router.get(
  "/summary",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await getSummaryStats(req.userId);
      res.status(200).json(stats);
    } catch (error) {
      console.error("Stats summary error:", error);
      res
        .status(500)
        .json(apiError("INTERNAL_ERROR", "Failed to fetch statistics. Please try again."));
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/stats/streak
// Returns streak information for the authenticated user.
// No request body or query params needed.
// ---------------------------------------------------------------------------
router.get(
  "/streak",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const streak = await getStreakStats(req.userId);
      res.status(200).json(streak);
    } catch (error) {
      console.error("Stats streak error:", error);
      res
        .status(500)
        .json(apiError("INTERNAL_ERROR", "Failed to fetch streak data. Please try again."));
    }
  }
);

export default router;
