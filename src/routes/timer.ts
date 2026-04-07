import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { TIMER_VARIANTS } from "../config/timerVariants";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/timer/variants
// Returns the list of available timer variants (static config)
// ---------------------------------------------------------------------------
router.get(
  "/variants",
  requireAuth,
  async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      variants: TIMER_VARIANTS,
    });
  }
);

export default router;
