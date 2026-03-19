import { Router, Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { apiError } from "../lib/apiError";

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/v1/auth/signup  [public]
// Creates a Supabase Auth user + inserts a row in public.users.
// ---------------------------------------------------------------------------
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(50),
  utcOffset: z.number().int().min(-720).max(840).default(0),
});

router.post(
  "/signup",
  validate(signupSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { email, password, name, utcOffset } = req.body as z.infer<typeof signupSchema>;

    // 1. Create user in Supabase Auth
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // auto-confirm for dev; set to false in prod if using email verification
    });

    if (error) {
      // Supabase returns a specific message when email is taken
      if (error.message.toLowerCase().includes("already") || error.status === 422) {
        res.status(409).json(apiError("EMAIL_TAKEN", "An account with this email already exists."));
        return;
      }
      res.status(500).json(apiError("INTERNAL_ERROR", "Failed to create account. Please try again."));
      return;
    }

    const authUser = data.user;

    // 2. Insert matching row in public.users
    const user = await prisma.user.create({
      data: {
        id: authUser.id, // same UUID as Supabase Auth
        email,
        name,
        utcOffset,
      },
    });

    // 3. Sign in immediately to return a JWT
    const { data: session, error: loginError } = await supabaseAnon.auth.signInWithPassword({
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
  }
);

// ---------------------------------------------------------------------------
// POST /api/v1/auth/login  [public]
// ---------------------------------------------------------------------------
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  "/login",
  validate(loginSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      res.status(401).json(apiError("INVALID_CREDENTIALS", "Incorrect email or password."));
      return;
    }

    // Fetch profile from public.users
    const user = await prisma.user.findUnique({
      where: { id: data.user.id },
    });

    if (!user) {
      // Auth user exists but no public.users row — shouldn't happen, but handle gracefully
      res.status(401).json(apiError("UNAUTHORIZED", "User profile not found."));
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
  }
);

// ---------------------------------------------------------------------------
// POST /api/v1/auth/logout
// ---------------------------------------------------------------------------
router.post(
  "/logout",
  requireAuth,
  async (_req: Request, res: Response): Promise<void> => {
    // Clear cookies
    res.clearCookie("sb-access-token");
    res.clearCookie("sb-refresh-token");

    // Note: JWTs are stateless — we can't truly invalidate them server-side
    // without a token revocation list (Redis). For v1, clearing cookies is sufficient.
    // Add ADR if you implement Redis-based revocation in the future.
    res.status(200).json({ message: "Logged out" });
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/auth/me
// ---------------------------------------------------------------------------
router.get(
  "/me",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!user) {
      res.status(404).json(apiError("USER_NOT_FOUND", "User not found."));
      return;
    }

    res.status(200).json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      utcOffset: user.utcOffset,
      createdAt: user.createdAt,
    });
  }
);

export default router;
