"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const apiError_1 = require("../lib/apiError");
const leaderboardService_1 = require("../services/leaderboardService");
const router = (0, express_1.Router)();
// ---------------------------------------------------------------------------
// Shared query schema — ?scope=global|none&page=1&limit=20
// ---------------------------------------------------------------------------
const leaderboardQuerySchema = zod_1.z.object({
    scope: zod_1.z.enum(["global", "none"]).default("global"),
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
});
// ---------------------------------------------------------------------------
// GET /api/v1/leaderboard/solo
// Global solo leaderboard ranked by all-time completed trees (stage=4).
// Returns: rank, userId, name, totalTrees, currentStreak
// ---------------------------------------------------------------------------
router.get("/solo", auth_1.requireAuth, async (req, res) => {
    const query = leaderboardQuerySchema.safeParse(req.query);
    if (!query.success) {
        res.status(400).json((0, apiError_1.apiError)("VALIDATION_ERROR", "Invalid query parameters."));
        return;
    }
    const { scope, page, limit } = query.data;
    const entries = await (0, leaderboardService_1.getSoloLeaderboard)(page, limit, scope);
    res.json({ entries, page, limit });
});
// ---------------------------------------------------------------------------
// GET /api/v1/leaderboard/groups
// Global groups leaderboard ranked by combined completed trees.
// Returns: rank, groupId, name, totalTrees, memberCount
// ---------------------------------------------------------------------------
router.get("/groups", auth_1.requireAuth, async (req, res) => {
    const query = leaderboardQuerySchema.safeParse(req.query);
    if (!query.success) {
        res.status(400).json((0, apiError_1.apiError)("VALIDATION_ERROR", "Invalid query parameters."));
        return;
    }
    const { page, limit } = query.data;
    const entries = await (0, leaderboardService_1.getGroupsLeaderboard)(page, limit);
    res.json({ entries, page, limit });
});
exports.default = router;
//# sourceMappingURL=leaderboard.js.map