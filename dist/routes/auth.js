"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const supabase_1 = require("../lib/supabase");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const apiError_1 = require("../lib/apiError");
const leaderboardService_1 = require("../services/leaderboardService");
const router = (0, express_1.Router)();
// ---------------------------------------------------------------------------
// POST /api/v1/auth/signup  [public]
// Creates a Supabase Auth user + inserts a row in public.users.
// ---------------------------------------------------------------------------
const signupSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, "Password must be at least 8 characters"),
    name: zod_1.z.string().min(1).max(50),
    utcOffset: zod_1.z.number().int().min(-720).max(840).default(0),
});
router.post("/signup", (0, validate_1.validate)(signupSchema), async (req, res) => {
    const { email, password, name, utcOffset } = req.body;
    // 1. Create user in Supabase Auth
    const { data, error } = await supabase_1.supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // auto-confirm for dev; set to false in prod if using email verification
    });
    if (error) {
        // Supabase returns a specific message when email is taken
        if (error.message.toLowerCase().includes("already") || error.status === 422) {
            res.status(409).json((0, apiError_1.apiError)("EMAIL_TAKEN", "An account with this email already exists."));
            return;
        }
        res.status(500).json((0, apiError_1.apiError)("INTERNAL_ERROR", "Failed to create account. Please try again."));
        return;
    }
    const authUser = data.user;
    // 2. Insert matching row in public.users
    const user = await prisma_1.prisma.user.create({
        data: {
            id: authUser.id, // same UUID as Supabase Auth
            email,
            name,
            utcOffset,
        },
    });
    // 3. Sign in immediately to return a JWT
    const { data: session, error: loginError } = await supabase_1.supabaseAnon.auth.signInWithPassword({
        email,
        password,
    });
    if (loginError || !session.session) {
        // User created but sign-in failed — still a success, just no token
        res.status(201).json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatarUrl: user.avatarUrl,
                utcOffset: user.utcOffset,
            },
        });
        return;
    }
    // Set httpOnly cookies (for future frontend use)
    res.cookie("sb-access-token", session.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 3600 * 1000, // 1 hour
    });
    res.cookie("sb-refresh-token", session.session.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 3600 * 1000, // 7 days
    });
    res.status(201).json({
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            utcOffset: user.utcOffset,
        },
        // Also return token for API clients (Postman, mobile apps)
        accessToken: session.session.access_token,
    });
});
// ---------------------------------------------------------------------------
// POST /api/v1/auth/login  [public]
// ---------------------------------------------------------------------------
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
router.post("/login", (0, validate_1.validate)(loginSchema), async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabase_1.supabaseAnon.auth.signInWithPassword({
        email,
        password,
    });
    if (error || !data.session) {
        res.status(401).json((0, apiError_1.apiError)("INVALID_CREDENTIALS", "Incorrect email or password."));
        return;
    }
    // Fetch profile from public.users
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: data.user.id },
    });
    if (!user) {
        // Auth user exists but no public.users row — shouldn't happen, but handle gracefully
        res.status(401).json((0, apiError_1.apiError)("UNAUTHORIZED", "User profile not found."));
        return;
    }
    // Set httpOnly cookies
    res.cookie("sb-access-token", data.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 3600 * 1000,
    });
    res.cookie("sb-refresh-token", data.session.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 3600 * 1000,
    });
    res.status(200).json({
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
        },
        accessToken: data.session.access_token,
    });
});
// ---------------------------------------------------------------------------
// POST /api/v1/auth/logout
// ---------------------------------------------------------------------------
router.post("/logout", auth_1.requireAuth, async (_req, res) => {
    // Clear cookies
    res.clearCookie("sb-access-token");
    res.clearCookie("sb-refresh-token");
    // Note: JWTs are stateless — we can't truly invalidate them server-side
    // without a token revocation list (Redis). For v1, clearing cookies is sufficient.
    // Add ADR if you implement Redis-based revocation in the future.
    res.status(200).json({ message: "Logged out" });
});
// ---------------------------------------------------------------------------
// GET /api/v1/auth/me
// ---------------------------------------------------------------------------
router.get("/me", auth_1.requireAuth, async (req, res) => {
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: req.userId },
    });
    if (!user) {
        res.status(404).json((0, apiError_1.apiError)("USER_NOT_FOUND", "User not found."));
        return;
    }
    res.status(200).json({
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        utcOffset: user.utcOffset,
        isPrivate: user.isPrivate,
        createdAt: user.createdAt,
    });
});
// ---------------------------------------------------------------------------
// PATCH /api/v1/auth/profile
// ---------------------------------------------------------------------------
const updateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(50).optional(),
    avatarUrl: zod_1.z.string().nullable().optional(),
    isPrivate: zod_1.z.boolean().optional(),
});
router.patch("/profile", auth_1.requireAuth, (0, validate_1.validate)(updateProfileSchema), async (req, res) => {
    const updates = req.body;
    const userId = req.userId;
    // Check if isPrivate is being toggled from true to false
    const currentUser = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: { isPrivate: true },
    });
    if (!currentUser) {
        res.status(404).json((0, apiError_1.apiError)("USER_NOT_FOUND", "User not found."));
        return;
    }
    const wasPrivate = currentUser.isPrivate;
    const willBePublic = updates.isPrivate === false && wasPrivate;
    // Update user profile
    const user = await prisma_1.prisma.user.update({
        where: { id: userId },
        data: updates,
    });
    // If user is going from private to public, immediately update leaderboard
    if (willBePublic) {
        try {
            await (0, leaderboardService_1.updateSoloLeaderboard)(userId);
        }
        catch (err) {
            console.error(`Failed to update leaderboard for user ${userId}:`, err);
            // Non-fatal — profile update succeeded
        }
    }
    res.status(200).json({
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        utcOffset: user.utcOffset,
        isPrivate: user.isPrivate,
        createdAt: user.createdAt,
    });
});
exports.default = router;
//# sourceMappingURL=auth.js.map