import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { apiError } from "../lib/apiError";
import { TIMER_VARIANTS, VALID_VARIANT_IDS } from "../config/timerVariants";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/user/preferences
// Returns user's saved timer preferences including leaf badge count
// ---------------------------------------------------------------------------
router.get(
  "/preferences",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;

    // Fetch user with preferences
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    if (!user) {
      res.status(404).json(apiError("USER_NOT_FOUND", "User not found."));
      return;
    }

    // Count completed trees (stage = 4) for leaf badge
    const leafCount = await prisma.dailyTree.count({
      where: {
        userId,
        stage: 4,
      },
    });

    // Get most recent task text from sessions
    const lastSession = await prisma.session.findFirst({
      where: {
        userId,
        taskText: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { taskText: true },
    });

    // Parse preferences JSON (default to empty object if null)
    const prefs = (user.preferences as Record<string, any>) ?? {};
    const selectedVariant = prefs.selectedVariant ?? "classic";
    const lastTaskText = prefs.lastTaskText ?? lastSession?.taskText ?? "";

    res.status(200).json({
      selectedVariant,
      leafCount,
      lastTaskText,
    });
  }
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/user/preferences
// Persists user's selected timer variant and last task text
// ---------------------------------------------------------------------------
const updatePreferencesSchema = z.object({
  selectedVariant: z.enum(["classic", "sprint", "deep", "ultra"]).optional(),
  lastTaskText: z.string().max(120).optional(),
});

router.patch(
  "/preferences",
  requireAuth,
  validate(updatePreferencesSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const updates = req.body as z.infer<typeof updatePreferencesSchema>;

    // Fetch current preferences
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    if (!user) {
      res.status(404).json(apiError("USER_NOT_FOUND", "User not found."));
      return;
    }

    // Merge new values into existing preferences
    const currentPrefs = (user.preferences as Record<string, any>) ?? {};
    const updatedPrefs = {
      ...currentPrefs,
      ...updates,
    };

    // Update user preferences
    await prisma.user.update({
      where: { id: userId },
      data: { preferences: updatedPrefs },
    });

    res.status(200).json({ ok: true });
  }
);

export default router;
