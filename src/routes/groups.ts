import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { apiError } from "../lib/apiError";
import {
  createGroup,
  joinGroup,
  getGroupDetails,
  getGroupCalendar,
  removeMember,
  getUserGroups,
  getGroupStats,
  getMemberStatus,
  deleteGroup,
} from "../services/groupService";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/groups
// Returns all groups the authenticated user belongs to (for sidebar list).
// ---------------------------------------------------------------------------
router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const groups = await getUserGroups(req.userId);

    res.status(200).json({ groups });
  }
);

// ---------------------------------------------------------------------------
// POST /api/v1/groups
// Create a new group. Authenticated user becomes admin and first member.
// ---------------------------------------------------------------------------
const createGroupSchema = z.object({
  name: z.string().min(1).max(50),
});

router.post(
  "/",
  requireAuth,
  validate(createGroupSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { name } = req.body as z.infer<typeof createGroupSchema>;

    const group = await createGroup(req.userId, name);

    res.status(201).json({
      id: group.id,
      name: group.name,
      inviteCode: group.inviteCode,
      memberCount: group.memberCount,
      createdAt: group.createdAt,
    });
  }
);

// ---------------------------------------------------------------------------
// POST /api/v1/groups/join
// Join a group via 6-digit invite code.
// IMPORTANT: must be registered before GET /:id to avoid "join" matching as an ID.
// ---------------------------------------------------------------------------
const joinGroupSchema = z.object({
  inviteCode: z.string().length(6).toUpperCase(),
});

router.post(
  "/join",
  requireAuth,
  validate(joinGroupSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { inviteCode } = req.body as z.infer<typeof joinGroupSchema>;

    const result = await joinGroup(req.userId, inviteCode);

    if (!result.ok) {
      switch (result.error.code) {
        case "INVALID_INVITE_CODE":
          res.status(404).json(apiError("INVALID_INVITE_CODE", "Invite code not found."));
          return;
        case "ALREADY_MEMBER":
          res.status(409).json(apiError("ALREADY_MEMBER", "You are already a member of this group."));
          return;
        case "GROUP_FULL":
          res.status(403).json(apiError("GROUP_FULL", "This group is full (maximum 5 members)."));
          return;
      }
    }

    res.status(200).json({
      id: result.group.id,
      name: result.group.name,
      memberCount: result.group.memberCount,
    });
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/groups/:id/stats
// Returns aggregate stat tiles for the selected group.
// ---------------------------------------------------------------------------
router.get(
  "/:id/stats",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const groupId = req.params.id as string;

    const result = await getGroupStats(groupId, req.userId);

    if (!result.ok) {
      switch (result.error.code) {
        case "GROUP_NOT_FOUND":
          res.status(404).json(apiError("GROUP_NOT_FOUND", "Group not found."));
          return;
        case "NOT_GROUP_MEMBER":
          res.status(403).json(apiError("NOT_GROUP_MEMBER", "You are not a member of this group."));
          return;
      }
    }

    res.status(200).json(result.stats);
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/groups/:id/members/status
// Returns real-time member status for the Members table.
// ---------------------------------------------------------------------------
router.get(
  "/:id/members/status",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const groupId = req.params.id as string;

    const result = await getMemberStatus(groupId, req.userId);

    if (!result.ok) {
      switch (result.error.code) {
        case "GROUP_NOT_FOUND":
          res.status(404).json(apiError("GROUP_NOT_FOUND", "Group not found."));
          return;
        case "NOT_GROUP_MEMBER":
          res.status(403).json(apiError("NOT_GROUP_MEMBER", "You are not a member of this group."));
          return;
      }
    }

    res.status(200).json({ members: result.members });
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/groups/:id
// Get group details, member list, and forest stats.
// Requires the requesting user to be a member of the group.
// ---------------------------------------------------------------------------
router.get(
  "/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const groupId = req.params.id as string;

    const result = await getGroupDetails(groupId, req.userId);

    if (!result.ok) {
      switch (result.error.code) {
        case "GROUP_NOT_FOUND":
          res.status(404).json(apiError("GROUP_NOT_FOUND", "Group not found."));
          return;
        case "FORBIDDEN":
          res.status(403).json(apiError("FORBIDDEN", "You are not a member of this group."));
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
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/groups/:id/calendar
// Collective daily output per member — accountability view.
// Optional ?month=M&year=YYYY filters (same pattern as /trees/calendar).
// ---------------------------------------------------------------------------
const calendarQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
});

router.get(
  "/:id/calendar",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const groupId = req.params.id as string;

    const query = calendarQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json(apiError("VALIDATION_ERROR", "Invalid query parameters."));
      return;
    }

    const { month, year } = query.data;

    const result = await getGroupCalendar(groupId, req.userId, month, year);

    if (!result.ok) {
      switch (result.error.code) {
        case "GROUP_NOT_FOUND":
          res.status(404).json(apiError("GROUP_NOT_FOUND", "Group not found."));
          return;
        case "FORBIDDEN":
          res.status(403).json(apiError("FORBIDDEN", "You are not a member of this group."));
          return;
      }
    }

    res.status(200).json({ days: result.days });
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/groups/:id
// Admin-only: deletes the entire group and removes all members.
// ---------------------------------------------------------------------------
router.delete(
  "/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const groupId = req.params.id as string;

    const result = await deleteGroup(groupId, req.userId);

    if (!result.ok) {
      switch (result.error.code) {
        case "GROUP_NOT_FOUND":
          res.status(404).json(apiError("GROUP_NOT_FOUND", "Group not found."));
          return;
        case "NOT_GROUP_ADMIN":
          res.status(403).json(apiError("NOT_GROUP_ADMIN", "Only the group admin can delete the group."));
          return;
      }
    }

    res.status(200).json({ message: "Group deleted." });
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/groups/:id/members/:userId
// Leave a group (self) or remove a member (admin only).
// ---------------------------------------------------------------------------
router.delete(
  "/:id/members/:userId",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const groupId = req.params.id as string;
    const targetUserId = req.params.userId as string;

    const result = await removeMember(groupId, targetUserId, req.userId);

    if (!result.ok) {
      switch (result.error.code) {
        case "GROUP_NOT_FOUND":
          res.status(404).json(apiError("GROUP_NOT_FOUND", "Group not found."));
          return;
        case "FORBIDDEN":
          res.status(403).json(
            apiError("FORBIDDEN", "Only the group admin can remove other members.")
          );
          return;
        case "NOT_FOUND":
          res.status(404).json(apiError("NOT_FOUND", "User is not a member of this group."));
          return;
      }
    }

    res.status(200).json({ message: "Member removed" });
  }
);

export default router;
