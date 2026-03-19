import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { apiError } from "../lib/apiError";
import { prisma } from "../lib/prisma";
import { computeStageProgress } from "../services/scoreEngine";
import { upsertDailyTree } from "../services/treeService";

const router = Router();

// ---------------------------------------------------------------------------
// Zod schema for POST /sessions
// Exactly per docs/API.md
// ---------------------------------------------------------------------------
const sessionSchema = z.object({
  variant: z.enum(["sprint", "classic", "deep_work", "flow", "custom"]),
  focusMinutes: z.number().int().min(1).max(240),
  taskText: z.string().max(200).optional(),
  taskStatus: z.enum(["completed", "carried", "none"]).default("none"),
  clientSessionId: z.string().uuid(),
});

type SessionBody = z.infer<typeof sessionSchema>;

// ---------------------------------------------------------------------------
// POST /api/v1/sessions
// Submit a completed focus session. Score engine runs server-side only.
// ---------------------------------------------------------------------------
router.post(
  "/",
  requireAuth,
  validate(sessionSchema),
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as SessionBody;
    const userId = req.userId;

    // 1. Deduplication — reject if clientSessionId already processed
    const existingSession = await prisma.session.findUnique({
      where: { clientSessionId: body.clientSessionId },
    });

    if (existingSession) {
      res
        .status(409)
        .json(apiError("DUPLICATE_SESSION", "This session has already been recorded."));
      return;
    }

    // 2. Ensure user row exists in our users table
    //    (Supabase Auth creates auth.users; we sync to public.users)
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res
        .status(401)
        .json(apiError("UNAUTHORIZED", "User profile not found. Please sign up again."));
      return;
    }

    // 3. Score engine — server-side only, never trust client values
    const { stageProgress } = computeStageProgress({
      focusMinutes: body.focusMinutes,
      taskStatus: body.taskStatus,
    });

    // 4. Write session row to DB
    await prisma.session.create({
      data: {
        userId,
        variant: body.variant,
        focusMinutes: body.focusMinutes,
        taskText: body.taskText ?? null,
        taskStatus: body.taskStatus,
        stageProgress,
        clientSessionId: body.clientSessionId,
      },
    });

    // 5. Update daily tree (upsert)
    const tree = await upsertDailyTree(userId, stageProgress, body.taskStatus);

    // 6. Get current streak
    const streak = await prisma.streak.findUnique({
      where: { userId },
      select: { currentStreak: true },
    });

    // 7. Return response — exactly per docs/API.md
    res.status(200).json({
      tree: {
        stage: tree.stage,
        glowLevel: tree.glowLevel,
        stageProgress: tree.stageProgress,
        totalSessions: tree.totalSessions,
        sessionsWithTask: tree.sessionsWithTask,
      },
      streak: {
        currentStreak: streak?.currentStreak ?? 0,
      },
    });
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/sessions
// Session history with optional date range filters.
// ---------------------------------------------------------------------------
const sessionQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const query = sessionQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json(apiError("VALIDATION_ERROR", "Invalid query parameters."));
      return;
    }

    const { startDate, endDate, limit, offset } = query.data;

    const where = {
      userId: req.userId,
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate
                ? { lt: new Date(new Date(endDate).getTime() + 86400000) }
                : {}),
            },
          }
        : {}),
    };

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          variant: true,
          focusMinutes: true,
          taskText: true,
          taskStatus: true,
          stageProgress: true,
          createdAt: true,
        },
      }),
      prisma.session.count({ where }),
    ]);

    res.status(200).json({ sessions, total });
  }
);

export default router;
