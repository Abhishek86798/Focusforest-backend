"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const apiError_1 = require("../lib/apiError");
const prisma_1 = require("../lib/prisma");
const scoreEngine_1 = require("../services/scoreEngine");
const treeService_1 = require("../services/treeService");
const router = (0, express_1.Router)();
// ---------------------------------------------------------------------------
// Zod schema for POST /sessions
// Exactly per docs/API.md
// ---------------------------------------------------------------------------
const sessionSchema = zod_1.z.object({
    variant: zod_1.z.enum(["sprint", "classic", "deep_work", "flow", "custom"]),
    focusMinutes: zod_1.z.number().int().min(1).max(240),
    taskText: zod_1.z.string().max(200).optional(),
    taskStatus: zod_1.z.enum(["completed", "carried", "none"]).default("none"),
    clientSessionId: zod_1.z.string().uuid(),
});
// ---------------------------------------------------------------------------
// POST /api/v1/sessions
// Submit a completed focus session. Score engine runs server-side only.
// ---------------------------------------------------------------------------
router.post("/", auth_1.requireAuth, (0, validate_1.validate)(sessionSchema), async (req, res) => {
    const body = req.body;
    const userId = req.userId;
    // 1. Deduplication — reject if clientSessionId already processed
    const existingSession = await prisma_1.prisma.session.findUnique({
        where: { clientSessionId: body.clientSessionId },
    });
    if (existingSession) {
        res
            .status(409)
            .json((0, apiError_1.apiError)("DUPLICATE_SESSION", "This session has already been recorded."));
        return;
    }
    // 2. Ensure user row exists in our users table
    //    (Supabase Auth creates auth.users; we sync to public.users)
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        res
            .status(401)
            .json((0, apiError_1.apiError)("UNAUTHORIZED", "User profile not found. Please sign up again."));
        return;
    }
    // 3. Score engine — server-side only, never trust client values
    const { stageProgress } = (0, scoreEngine_1.computeStageProgress)({
        focusMinutes: body.focusMinutes,
        taskStatus: body.taskStatus,
    });
    // 4. Write session row to DB
    await prisma_1.prisma.session.create({
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
    const tree = await (0, treeService_1.upsertDailyTree)(userId, stageProgress, body.taskStatus);
    // 6. Get current streak
    const streak = await prisma_1.prisma.streak.findUnique({
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
});
// ---------------------------------------------------------------------------
// GET /api/v1/sessions
// Session history with optional date range filters.
// ---------------------------------------------------------------------------
const sessionQuerySchema = zod_1.z.object({
    startDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(200).default(50),
    offset: zod_1.z.coerce.number().int().min(0).default(0),
});
router.get("/", auth_1.requireAuth, async (req, res) => {
    const query = sessionQuerySchema.safeParse(req.query);
    if (!query.success) {
        res.status(400).json((0, apiError_1.apiError)("VALIDATION_ERROR", "Invalid query parameters."));
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
        prisma_1.prisma.session.findMany({
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
        prisma_1.prisma.session.count({ where }),
    ]);
    res.status(200).json({ sessions, total });
});
exports.default = router;
//# sourceMappingURL=sessions.js.map