"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const prisma_1 = require("../lib/prisma");
const apiError_1 = require("../lib/apiError");
const router = (0, express_1.Router)();
// ---------------------------------------------------------------------------
// Helper: get user's local "today" date as a Date object (time zeroed)
// ---------------------------------------------------------------------------
async function getUserLocalToday(userId) {
    const user = await prisma_1.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { utcOffset: true },
    });
    const localMs = Date.now() + user.utcOffset * 60 * 1000;
    const iso = new Date(localMs).toISOString().slice(0, 10); // "YYYY-MM-DD"
    return new Date(iso); // midnight UTC — used as the date key in DB
}
// ---------------------------------------------------------------------------
// Helper: parse ISO week string "YYYY-Www" → { startDate, endDate }
// Week starts Monday, ends Sunday.
// ---------------------------------------------------------------------------
function parseWeekId(weekId) {
    const match = weekId.match(/^(\d{4})-W(\d{2})$/);
    if (!match)
        return null;
    const year = parseInt(match[1], 10);
    const week = parseInt(match[2], 10);
    if (week < 1 || week > 53)
        return null;
    // ISO week date: Thursday of the week is always in the correct year.
    // Jan 4 is always in week 1. Use that as anchor.
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7; // Mon=1 ... Sun=7
    const week1Monday = new Date(jan4);
    week1Monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1));
    const startDate = new Date(week1Monday);
    startDate.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
    const endDate = new Date(startDate);
    endDate.setUTCDate(startDate.getUTCDate() + 6);
    return { startDate, endDate };
}
// ---------------------------------------------------------------------------
// GET /api/v1/trees/today
// Returns today's live tree state for the authenticated user.
// Uses user's utcOffset to determine "today".
// ---------------------------------------------------------------------------
router.get("/today", auth_1.requireAuth, async (req, res) => {
    const today = await getUserLocalToday(req.userId);
    const tree = await prisma_1.prisma.dailyTree.findUnique({
        where: { userId_date: { userId: req.userId, date: today } },
    });
    if (!tree) {
        // No session today yet — return seed state
        res.status(200).json({
            date: today.toISOString().slice(0, 10),
            stage: 0,
            glowLevel: 0,
            totalSessions: 0,
            sessionsWithTask: 0,
            isBare: false,
            finalisedAt: null,
        });
        return;
    }
    res.status(200).json({
        date: tree.date.toISOString().slice(0, 10),
        stage: tree.stage,
        glowLevel: tree.glowLevel,
        totalSessions: tree.totalSessions,
        sessionsWithTask: tree.sessionsWithTask,
        isBare: tree.isBare,
        finalisedAt: tree.finalisedAt ?? null,
    });
});
// ---------------------------------------------------------------------------
// GET /api/v1/trees/calendar
// Returns all daily_trees for the user.
// Optional query: ?month=3&year=2025
// ---------------------------------------------------------------------------
const calendarQuerySchema = zod_1.z.object({
    month: zod_1.z.coerce.number().int().min(1).max(12).optional(),
    year: zod_1.z.coerce.number().int().min(2020).max(2100).optional(),
});
router.get("/calendar", auth_1.requireAuth, async (req, res) => {
    const query = calendarQuerySchema.safeParse(req.query);
    if (!query.success) {
        res.status(400).json((0, apiError_1.apiError)("VALIDATION_ERROR", "Invalid query parameters."));
        return;
    }
    const { month, year } = query.data;
    // Build date range filter if month+year are provided
    let dateFilter;
    if (month !== undefined && year !== undefined) {
        const start = new Date(Date.UTC(year, month - 1, 1));
        const end = new Date(Date.UTC(year, month, 0)); // last day of month
        dateFilter = { gte: start, lte: end };
    }
    else if (year !== undefined) {
        dateFilter = {
            gte: new Date(Date.UTC(year, 0, 1)),
            lte: new Date(Date.UTC(year, 11, 31)),
        };
    }
    const trees = await prisma_1.prisma.dailyTree.findMany({
        where: {
            userId: req.userId,
            ...(dateFilter ? { date: dateFilter } : {}),
        },
        orderBy: { date: "asc" },
        select: {
            date: true,
            stage: true,
            glowLevel: true,
            totalSessions: true,
            sessionsWithTask: true,
            isBare: true,
            finalisedAt: true,
        },
    });
    res.status(200).json({
        trees: trees.map((t) => ({
            date: t.date.toISOString().slice(0, 10),
            stage: t.stage,
            glowLevel: t.glowLevel,
            totalSessions: t.totalSessions,
            sessionsWithTask: t.sessionsWithTask,
            isBare: t.isBare,
            finalisedAt: t.finalisedAt ?? null,
        })),
    });
});
// ---------------------------------------------------------------------------
// GET /api/v1/trees/week/:weekId
// Returns all 7 day slots for a specific ISO week.
// weekId format: "YYYY-Www" e.g. "2025-W10"
// Week complete = all 7 days have at least 1 session (stage >= 1).
// ---------------------------------------------------------------------------
router.get("/week/:weekId", auth_1.requireAuth, async (req, res) => {
    const weekId = req.params.weekId;
    const range = parseWeekId(weekId);
    if (!range) {
        res.status(400).json((0, apiError_1.apiError)("VALIDATION_ERROR", "Invalid weekId format. Use YYYY-Www (e.g. 2025-W10)."));
        return;
    }
    const { startDate, endDate } = range;
    const trees = await prisma_1.prisma.dailyTree.findMany({
        where: {
            userId: req.userId,
            date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: "asc" },
        select: {
            date: true,
            stage: true,
            glowLevel: true,
            totalSessions: true,
            isBare: true,
            finalisedAt: true,
        },
    });
    // Build a full 7-day grid — fill missing days with null (no session yet)
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setUTCDate(startDate.getUTCDate() + i);
        const dateStr = d.toISOString().slice(0, 10);
        const found = trees.find((t) => t.date.toISOString().slice(0, 10) === dateStr);
        days.push(found
            ? {
                date: dateStr,
                stage: found.stage,
                glowLevel: found.glowLevel,
                totalSessions: found.totalSessions,
                isBare: found.isBare,
                finalisedAt: found.finalisedAt ?? null,
            }
            : {
                date: dateStr,
                stage: 0,
                glowLevel: 0,
                totalSessions: 0,
                isBare: false, // not yet finalised
                finalisedAt: null,
            });
    }
    // Week complete = all 7 days have at least 1 session (min Sprout stage)
    const complete = days.every((d) => d.totalSessions > 0);
    res.status(200).json({
        weekId,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        complete,
        days,
    });
});
exports.default = router;
//# sourceMappingURL=trees.js.map