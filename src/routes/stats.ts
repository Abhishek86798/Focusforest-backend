/**
 * Stats Routes
 * 
 * Provides authenticated endpoints for retrieving user statistics and streak information.
 * All endpoints require authentication via Bearer token in Authorization header.
 * 
 * Endpoints:
 * - GET /api/v1/stats/summary - Returns aggregate statistics for the authenticated user
 * - GET /api/v1/stats/streak - Returns streak information for the authenticated user
 * 
 * Authentication:
 * All endpoints require a valid Supabase JWT token:
 *   Authorization: Bearer <token>
 * 
 * Returns 401 UNAUTHORIZED if token is missing or invalid.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { apiError } from "../lib/apiError";
import { getSummaryStats, getStreakStats } from "../services/statsService";

const router = Router();

// ---------------------------------------------------------------------------
// Zod schema for GET /summary (empty schema - no query params)
// ---------------------------------------------------------------------------
const summaryQuerySchema = z.object({});

// ---------------------------------------------------------------------------
// Zod schema for GET /streak (empty schema - no query params)
// ---------------------------------------------------------------------------
const streakQuerySchema = z.object({});

// ---------------------------------------------------------------------------
// GET /api/v1/stats/summary
// 
// Returns aggregate statistics for the authenticated user's focus sessions and trees.
// Aggregates data from sessions and daily_trees tables.
// Only counts completed sessions (state = 'completed').
// 
// Authentication: Required (Bearer token)
// 
// Query Parameters: None
// 
// Response (200 OK):
// {
//   "totalMinutes": 450,        // Sum of focus_minutes from all completed sessions
//   "treesCompleted": 12,       // Count of daily_trees where stage = 4
//   "sessions": 18,             // Count of completed sessions
//   "taskCompletionRate": 0.67  // Ratio of completed tasks to total sessions (0-1)
// }
// 
// Edge Cases:
// - User with no sessions: all values return 0
// - User with no completed tasks: taskCompletionRate returns 0
// - Only completed sessions count (abandoned sessions excluded)
// 
// Error Responses:
// - 401 UNAUTHORIZED: Missing or invalid authentication token
// - 500 INTERNAL_ERROR: Database error
// ---------------------------------------------------------------------------
router.get(
  "/summary",
  requireAuth,
  validate(summaryQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await getSummaryStats(req.userId);
      res.status(200).json(stats);
    } catch (error) {
      res
        .status(500)
        .json(apiError("INTERNAL_ERROR", "Failed to fetch statistics. Please try again."));
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/stats/streak
// 
// Returns streak information for the authenticated user.
// Queries the streaks table for current and longest streak data.
// 
// Authentication: Required (Bearer token)
// 
// Query Parameters: None
// 
// Response (200 OK) - With Streak Record:
// {
//   "currentStreak": 7,           // Current consecutive days with sessions
//   "longestStreak": 14,          // All-time longest streak
//   "lastActiveDate": "2025-03-25" // Last day with activity (YYYY-MM-DD format)
// }
// 
// Response (200 OK) - No Streak Record:
// {
//   "currentStreak": 0,
//   "longestStreak": 0,
//   "lastActiveDate": null
// }
// 
// Notes:
// - Streaks increment by 1 for any day with at least 1 completed session
// - Streaks reset to 0 on a missed day
// - lastActiveDate is formatted as YYYY-MM-DD or null if no activity
// 
// Error Responses:
// - 401 UNAUTHORIZED: Missing or invalid authentication token
// - 500 INTERNAL_ERROR: Database error
// ---------------------------------------------------------------------------
router.get(
  "/streak",
  requireAuth,
  validate(streakQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const streak = await getStreakStats(req.userId);
      res.status(200).json(streak);
    } catch (error) {
      res
        .status(500)
        .json(apiError("INTERNAL_ERROR", "Failed to fetch streak data. Please try again."));
    }
  }
);

export default router;
