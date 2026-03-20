"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const apiError_1 = require("../lib/apiError");
const groupService_1 = require("../services/groupService");
const router = (0, express_1.Router)();
// ---------------------------------------------------------------------------
// POST /api/v1/groups
// Create a new group. Authenticated user becomes admin and first member.
// ---------------------------------------------------------------------------
const createGroupSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(50),
});
router.post("/", auth_1.requireAuth, (0, validate_1.validate)(createGroupSchema), async (req, res) => {
    const { name } = req.body;
    const group = await (0, groupService_1.createGroup)(req.userId, name);
    res.status(201).json({
        id: group.id,
        name: group.name,
        inviteCode: group.inviteCode,
        memberCount: group.memberCount,
        createdAt: group.createdAt,
    });
});
// ---------------------------------------------------------------------------
// POST /api/v1/groups/join
// Join a group via 6-digit invite code.
// IMPORTANT: must be registered before GET /:id to avoid "join" matching as an ID.
// ---------------------------------------------------------------------------
const joinGroupSchema = zod_1.z.object({
    inviteCode: zod_1.z.string().length(6).toUpperCase(),
});
router.post("/join", auth_1.requireAuth, (0, validate_1.validate)(joinGroupSchema), async (req, res) => {
    const { inviteCode } = req.body;
    const result = await (0, groupService_1.joinGroup)(req.userId, inviteCode);
    if (!result.ok) {
        switch (result.error.code) {
            case "INVALID_INVITE_CODE":
                res.status(404).json((0, apiError_1.apiError)("INVALID_INVITE_CODE", "Invite code not found."));
                return;
            case "ALREADY_MEMBER":
                res.status(409).json((0, apiError_1.apiError)("ALREADY_MEMBER", "You are already a member of this group."));
                return;
            case "GROUP_FULL":
                res.status(403).json((0, apiError_1.apiError)("GROUP_FULL", "This group is full (maximum 5 members)."));
                return;
        }
    }
    res.status(200).json({
        id: result.group.id,
        name: result.group.name,
        memberCount: result.group.memberCount,
    });
});
// ---------------------------------------------------------------------------
// GET /api/v1/groups/:id
// Get group details, member list, and forest stats.
// Requires the requesting user to be a member of the group.
// ---------------------------------------------------------------------------
router.get("/:id", auth_1.requireAuth, async (req, res) => {
    const groupId = req.params.id;
    const result = await (0, groupService_1.getGroupDetails)(groupId, req.userId);
    if (!result.ok) {
        switch (result.error.code) {
            case "GROUP_NOT_FOUND":
                res.status(404).json((0, apiError_1.apiError)("GROUP_NOT_FOUND", "Group not found."));
                return;
            case "FORBIDDEN":
                res.status(403).json((0, apiError_1.apiError)("FORBIDDEN", "You are not a member of this group."));
                return;
        }
    }
    const { group } = result;
    res.status(200).json({
        id: group.id,
        name: group.name,
        inviteCode: group.inviteCode,
        memberCount: group.memberCount,
        adminUserId: group.adminUserId,
        members: group.members.map((m) => ({
            userId: m.userId,
            name: m.name,
            avatarUrl: m.avatarUrl,
            currentStreak: m.currentStreak,
            joinedAt: m.joinedAt,
        })),
        forestStats: group.forestStats,
        createdAt: group.createdAt,
    });
});
// ---------------------------------------------------------------------------
// GET /api/v1/groups/:id/calendar
// Collective daily output per member — accountability view.
// Optional ?month=M&year=YYYY filters (same pattern as /trees/calendar).
// ---------------------------------------------------------------------------
const calendarQuerySchema = zod_1.z.object({
    month: zod_1.z.coerce.number().int().min(1).max(12).optional(),
    year: zod_1.z.coerce.number().int().min(2020).max(2100).optional(),
});
router.get("/:id/calendar", auth_1.requireAuth, async (req, res) => {
    const groupId = req.params.id;
    const query = calendarQuerySchema.safeParse(req.query);
    if (!query.success) {
        res.status(400).json((0, apiError_1.apiError)("VALIDATION_ERROR", "Invalid query parameters."));
        return;
    }
    const { month, year } = query.data;
    const result = await (0, groupService_1.getGroupCalendar)(groupId, req.userId, month, year);
    if (!result.ok) {
        switch (result.error.code) {
            case "GROUP_NOT_FOUND":
                res.status(404).json((0, apiError_1.apiError)("GROUP_NOT_FOUND", "Group not found."));
                return;
            case "FORBIDDEN":
                res.status(403).json((0, apiError_1.apiError)("FORBIDDEN", "You are not a member of this group."));
                return;
        }
    }
    res.status(200).json({ days: result.days });
});
// ---------------------------------------------------------------------------
// DELETE /api/v1/groups/:id/members/:userId
// Leave a group (self) or remove a member (admin only).
// ---------------------------------------------------------------------------
router.delete("/:id/members/:userId", auth_1.requireAuth, async (req, res) => {
    const groupId = req.params.id;
    const targetUserId = req.params.userId;
    const result = await (0, groupService_1.removeMember)(groupId, targetUserId, req.userId);
    if (!result.ok) {
        switch (result.error.code) {
            case "GROUP_NOT_FOUND":
                res.status(404).json((0, apiError_1.apiError)("GROUP_NOT_FOUND", "Group not found."));
                return;
            case "FORBIDDEN":
                res.status(403).json((0, apiError_1.apiError)("FORBIDDEN", "Only the group admin can remove other members."));
                return;
            case "NOT_FOUND":
                res.status(404).json((0, apiError_1.apiError)("NOT_FOUND", "User is not a member of this group."));
                return;
        }
    }
    res.status(200).json({ message: "Member removed" });
});
exports.default = router;
//# sourceMappingURL=groups.js.map