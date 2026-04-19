import { Router, Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { apiError } from "../lib/apiError";
import rateLimit from "express-rate-limit";
import { leaderboardQueue } from "../lib/queue";
import { revokeToken } from "../lib/tokenBlocklist";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: apiError("RATE_LIMITED", "Too many login attempts, please try again in 15 minutes."),
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: apiError("RATE_LIMITED", "Too many accounts created from this IP, please try again in an hour."),
});

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(50),
  utcOffset: z.number().int().min(-720).max(840).default(0),
});

// ── NEW OAUTH / OTP SCHEMAS & LIMITERS ────────────────────────────────────────

const googleCallbackSchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
});

const phoneOtpSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number format"),
});

const verifyOtpSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number format"),
  otp: z.string().length(6, "OTP must be 6 digits"),
});

const otpSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: apiError("RATE_LIMITED", "Too many OTP requests. Try again in a minute."),
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: apiError("RATE_LIMITED", "Too many attempts. Try again later."),
});

// ── GOOGLE OAUTH ROUTES ──────────────────────────────────────────────────────

/**
 * 1. SUPABASE DASHBOARD CONFIGURATION (MANUAL STEP):
 * - Go to Supabase Dashboard -> Authentication -> Providers -> Enable "Google"
 * - Add Google Client ID & Secret
 * - Set Google Authorized Redirect URI: https://<project>.supabase.co/auth/v1/callback
 * - Add http://localhost:5173/auth/callback to "Redirect URLs" under Authentication -> URL Configuration
 */
router.post("/google", async (req: Request, res: Response): Promise<void> => {
  try {
    const redirectTo =
      process.env.GOOGLE_REDIRECT_URL ||
      `${process.env.CLIENT_URL || "http://localhost:5173"}/auth/callback`;

    const { data, error } = await supabaseAdmin.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
        // IMPORTANT: skipBrowserRedirect=true so Supabase returns the URL
        // instead of trying to redirect (we're server-side)
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      console.error("Google OAuth initiation error:", error);
      res.status(400).json(apiError("OAUTH_INIT_FAILED", "Failed to initiate Google sign-in."));
      return;
    }

    res.status(200).json({
      status: "success",
      data: { url: data.url },
    });
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.status(500).json(apiError("INTERNAL_ERROR", "An unexpected error occurred."));
  }
});

router.post(
  "/callback",
  validate(googleCallbackSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { code } = req.body as z.infer<typeof googleCallbackSchema>;

      // NOTE: exchangeCodeForSession requires the PKCE verifier that was stored
      // in the browser during the OAuth initiation. When using supabaseAnon
      // server-side the verifier won't exist — Supabase will likely reject this.
      // The /token-callback route below handles the more reliable hash-fragment flow.
      const { data, error } = await supabaseAnon.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("OAuth /callback code exchange error:", error.message);
        res.status(401).json(apiError("AUTH_FAILED", "Failed to authenticate with Google. " + error.message));
        return;
      }

      const { session, user: supabaseUser } = data;

      if (!session || !supabaseUser) {
        res.status(401).json(apiError("AUTH_FAILED", "Authentication failed."));
        return;
      }

      let user = await prisma.user.findUnique({
        where: { id: supabaseUser.id },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            id: supabaseUser.id,
            email: supabaseUser.email || "",
            name:
              supabaseUser.user_metadata?.full_name ||
              supabaseUser.user_metadata?.name ||
              supabaseUser.email?.split("@")[0] ||
              "User",
            avatarUrl:
              supabaseUser.user_metadata?.avatar_url ||
              supabaseUser.user_metadata?.picture ||
              null,
            utcOffset: 0,
            default_variant: "classic",
            auth_provider: "google",
          },
        });

        await prisma.streak.create({
          data: {
            userId: user.id,
            currentStreak: 0,
            longestStreak: 0,
            lastActiveDate: new Date(),
          },
        });
      } else {
        if (!user.avatarUrl && supabaseUser.user_metadata?.avatar_url) {
          await prisma.user.update({
            where: { id: user.id },
            data: { avatarUrl: supabaseUser.user_metadata.avatar_url },
          });
        }
      }

      // Use 'lax' so cookies survive the OAuth cross-site redirect in dev
      const sameSite = process.env.NODE_ENV === "production" ? "none" : "lax";
      const secure = process.env.NODE_ENV === "production";

      res.cookie("sb-access-token", session.access_token, {
        httpOnly: true,
        secure,
        sameSite,
        maxAge: 3600 * 1000,
        path: "/",
      });
      res.cookie("sb-refresh-token", session.refresh_token, {
        httpOnly: true,
        secure,
        sameSite,
        maxAge: 7 * 24 * 3600 * 1000,
        path: "/",
      });

      res.status(200).json({
        status: "success",
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            phone: user.phone,
            authProvider: user.auth_provider,
          },
        },
      });
    } catch (err: any) {
      console.error("OAuth callback error:", err);
      res.status(500).json(apiError("INTERNAL_ERROR", "An unexpected error occurred."));
    }
  }
);

// ── TOKEN-CALLBACK: receives hash-fragment tokens from browser PKCE flow ───────
const tokenCallbackSchema = z.object({
  access_token: z.string().min(1, "access_token is required"),
  refresh_token: z.string().min(1, "refresh_token is required"),
});

router.post(
  "/token-callback",
  validate(tokenCallbackSchema),
  async (req: Request, res: Response): Promise<void> => {
    console.log("\n🔑 /token-callback hit");
    try {
      const { access_token, refresh_token } = req.body as z.infer<typeof tokenCallbackSchema>;
      console.log("🔑 Step 1: tokens received — access_token present:", !!access_token, "| refresh_token present:", !!refresh_token);

      // Step 2: Verify the access token with Supabase Admin
      console.log("🔑 Step 2: calling supabaseAdmin.auth.getUser...");
      const { data: { user: supabaseUser }, error } = await supabaseAdmin.auth.getUser(access_token);
      console.log("🔑 Step 2 done — userId:", supabaseUser?.id, "| error:", error?.message ?? "none");

      if (error || !supabaseUser) {
        console.warn("🔑 Step 2 FAILED — invalid token:", error?.message);
        res.status(401).json(apiError("INVALID_TOKEN", "Invalid or expired token."));
        return;
      }

      // Step 3: Look up or create user in Prisma DB (with explicit 8s timeout)
      const dbTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error("Database connection timeout (ETIMEDOUT)"), { name: "PrismaClientUnknownRequestError" })), 8000)
      );
      console.log("🔑 Step 3: prisma.user.findUnique for id:", supabaseUser.id);
      let user = await Promise.race([
        prisma.user.findUnique({ where: { id: supabaseUser.id } }),
        dbTimeout,
      ]);
      console.log("🔑 Step 3 done — existing user:", !!user);

      if (!user) {
        console.log("🔑 Step 4: creating new user in DB...");
        user = await prisma.user.create({
          data: {
            id: supabaseUser.id,
            email: supabaseUser.email || "",
            name:
              supabaseUser.user_metadata?.full_name ||
              supabaseUser.user_metadata?.name ||
              supabaseUser.email?.split("@")[0] ||
              "User",
            avatarUrl:
              supabaseUser.user_metadata?.avatar_url ||
              supabaseUser.user_metadata?.picture ||
              null,
            utcOffset: 0,
            default_variant: "classic",
            auth_provider: "google",
          },
        });
        console.log("🔑 Step 4 done — user created:", user.id);

        console.log("🔑 Step 4b: creating initial streak...");
        await prisma.streak.create({
          data: {
            userId: user.id,
            currentStreak: 0,
            longestStreak: 0,
            lastActiveDate: new Date(),
          },
        });
        console.log("🔑 Step 4b done");
      } else {
        // Update avatar from Google if user doesn't have one yet
        if (!user.avatarUrl && supabaseUser.user_metadata?.avatar_url) {
          console.log("🔑 Step 4 (existing): updating avatar...");
          await prisma.user.update({
            where: { id: user.id },
            data: { avatarUrl: supabaseUser.user_metadata.avatar_url },
          });
          user = { ...user, avatarUrl: supabaseUser.user_metadata.avatar_url };
        }
      }

      // Step 5: Set httpOnly cookies
      console.log("🔑 Step 5: setting cookies...");
      const sameSite = process.env.NODE_ENV === "production" ? "none" : "lax";
      const secure = process.env.NODE_ENV === "production";

      res.cookie("sb-access-token", access_token, {
        httpOnly: true,
        secure,
        sameSite,
        maxAge: 3600 * 1000,
        path: "/",
      });
      res.cookie("sb-refresh-token", refresh_token, {
        httpOnly: true,
        secure,
        sameSite,
        maxAge: 7 * 24 * 3600 * 1000,
        path: "/",
      });

      console.log("🔑 Step 6: sending 200 response for user:", user.email);

      return res.status(200).json({
        status: "success",
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            phone: user.phone,
            authProvider: user.auth_provider,
          },
        },
      }) as any;
    } catch (err: any) {
      // Log the full error so we can diagnose exactly where it crashed
      console.error("\n🔑 ❌ /token-callback CRASH at step above ↑");
      console.error("🔑 Error name:", err?.name);
      console.error("🔑 Error code:", err?.code);
      console.error("🔑 Error message:", err?.message);

      // Prisma DB connection errors (can't reach Supabase Postgres from local network)
      const isPrismaErr =
        err?.name === "PrismaClientInitializationError" ||
        err?.name === "PrismaClientKnownRequestError" ||
        err?.name === "PrismaClientUnknownRequestError" ||
        String(err?.code ?? "").startsWith("P") ||
        String(err?.message ?? "").includes("ETIMEDOUT") ||
        String(err?.message ?? "").includes("ECONNREFUSED") ||
        String(err?.message ?? "").includes("socket") ||
        String(err?.message ?? "").includes("Can't reach database");

      if (isPrismaErr) {
        console.error("🔑 Prisma/DB error — DB may be unreachable from this network (port 6543 blocked?)");
        res.status(503).json({ status: "error", code: "SERVICE_UNAVAILABLE", message: "Database connection failed. Please try again." });
        return;
      }

      res.status(500).json(apiError("INTERNAL_ERROR", "An unexpected error occurred."));
    }
  }
);

// ── PHONE OTP ROUTES ──────────────────────────────────────────────────────────

/**
 * 2. SUPABASE DASHBOARD CONFIGURATION (MANUAL STEP):
 * - Go to Supabase Dashboard -> Authentication -> Providers -> Enable "Phone"
 * - Select Twilio as Provider
 * - Configure Twilio Account SID, Auth Token, and Messaging Service SID
 */
router.post(
  "/phone/send-otp",
  otpSendLimiter,
  validate(phoneOtpSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { phone } = req.body as z.infer<typeof phoneOtpSchema>;

      console.log('📱 OTP request for:', phone);

      const { error } = await supabaseAdmin.auth.signInWithOtp({
        phone: phone,
      });

      if (error) {
        console.error('📱 Supabase OTP error:', error.message, error.status);
        res.status(400).json(apiError("OTP_SEND_FAILED", error.message || "Failed to send OTP. Please try again."));
        return;
      }

      console.log('📱 OTP sent successfully to:', phone);
      res.status(200).json({
        status: "success",
        message: "OTP sent successfully.",
      });
    } catch (err) {
      console.error("Phone OTP error:", err);
      res.status(500).json(apiError("INTERNAL_ERROR", "An unexpected error occurred."));
    }
  }
);

router.post(
  "/phone/verify-otp",
  otpVerifyLimiter,
  validate(verifyOtpSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { phone, otp } = req.body as z.infer<typeof verifyOtpSchema>;

      const { data, error } = await supabaseAnon.auth.verifyOtp({
        phone: phone,
        token: otp,
        type: "sms",
      });

      if (error) {
        console.error("OTP verification error:", error);
        res.status(401).json(apiError("INVALID_OTP", "Invalid or expired OTP. Please try again."));
        return;
      }

      const { session, user: supabaseUser } = data;

      if (!session || !supabaseUser) {
        res.status(401).json(apiError("AUTH_FAILED", "Authentication failed."));
        return;
      }

      let user = await prisma.user.findUnique({
        where: { id: supabaseUser.id },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            id: supabaseUser.id,
            email: supabaseUser.phone || "",
            name: `User${supabaseUser.phone?.slice(-4) || ""}`,
            avatarUrl: null,
            phone: supabaseUser.phone,
            utcOffset: 0,
            default_variant: "classic",
            auth_provider: "phone",
          },
        });

        await prisma.streak.create({
          data: {
            userId: user.id,
            currentStreak: 0,
            longestStreak: 0,
            lastActiveDate: new Date(),
          },
        });
      }

      res.cookie("sb-access-token", session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 3600 * 1000,
      });
      res.cookie("sb-refresh-token", session.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 3600 * 1000,
      });

      res.status(200).json({
        status: "success",
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            phone: user.phone,
            authProvider: user.auth_provider,
          },
        },
      });
    } catch (err: any) {
      console.error("Phone verify error:", err);
      res.status(500).json(apiError("INTERNAL_ERROR", "An unexpected error occurred."));
    }
  }
);

router.post(
  "/signup",
  signupLimiter,
  validate(signupSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, name, utcOffset } = req.body as z.infer<typeof signupSchema>;

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error) {
        if (error.message.toLowerCase().includes("already") || error.status === 422) {
          res.status(409).json(apiError("EMAIL_TAKEN", "An account with this email already exists."));
          return;
        }
        res.status(500).json(apiError("INTERNAL_ERROR", "Failed to create account. Please try again."));
        return;
      }

      const authUser = data.user;

      const user = await prisma.user.create({
        data: {
          id: authUser.id,
          email,
          name,
          utcOffset,
        },
      });

      const { data: session, error: loginError } = await supabaseAnon.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError || !session.session) {
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

      res.cookie("sb-access-token", session.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 3600 * 1000,
      });
      res.cookie("sb-refresh-token", session.session.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 3600 * 1000,
      });

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          utcOffset: user.utcOffset,
        },
        accessToken: session.session.access_token,
      });
    } catch (err: any) {
      console.error("Signup Error:", err);
      if (err?.name === "PrismaClientInitializationError" || err?.name === "PrismaClientKnownRequestError") {
        res.status(503).json({ status: "error", code: "SERVICE_UNAVAILABLE", message: "Database connection failed. Please try again." });
      } else {
        res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message: "An unexpected error occurred." });
      }
    }
  }
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  "/login",
  loginLimiter,
  validate(loginSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body as z.infer<typeof loginSchema>;

      const { data, error } = await supabaseAnon.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data.session) {
        res.status(401).json(apiError("INVALID_CREDENTIALS", "Incorrect email or password."));
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: data.user.id },
      });

      if (!user) {
        res.status(401).json(apiError("UNAUTHORIZED", "User profile not found."));
        return;
      }

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
    } catch (err: any) {
      console.error("Login Error:", err);
      if (err?.name === "PrismaClientInitializationError" || err?.name === "PrismaClientKnownRequestError") {
        res.status(503).json({ status: "error", code: "SERVICE_UNAVAILABLE", message: "Database connection failed. Please try again." });
      } else {
        res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message: "An unexpected error occurred." });
      }
    }
  }
);

router.post(
  "/logout",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const token = req.cookies["sb-access-token"] || req.headers.authorization?.slice(7);
      if (token) await revokeToken(token);
      
      res.clearCookie("sb-access-token");
      res.clearCookie("sb-refresh-token");

      res.status(200).json({ message: "Logged out" });
    } catch (err: any) {
      console.error("Logout Error:", err);
      if (err?.name === "PrismaClientInitializationError" || err?.name === "PrismaClientKnownRequestError") {
        res.status(503).json({ status: "error", code: "SERVICE_UNAVAILABLE", message: "Database connection failed. Please try again." });
      } else {
        res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message: "An unexpected error occurred." });
      }
    }
  }
);

router.get(
  "/me",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
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
        phone: user.phone,
        authProvider: user.auth_provider,
        utcOffset: user.utcOffset,
        isPrivate: user.isPrivate,
        default_variant: user.default_variant,
        createdAt: user.createdAt,
      });
    } catch (err: any) {
      console.error("Me Error:", err);
      if (err?.name === "PrismaClientInitializationError" || err?.name === "PrismaClientKnownRequestError") {
        res.status(503).json({ status: "error", code: "SERVICE_UNAVAILABLE", message: "Database connection failed. Please try again." });
      } else {
        res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message: "An unexpected error occurred." });
      }
    }
  }
);

const updateProfileSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().nullable().optional(),
  isPrivate: z.boolean().optional(),
  default_variant: z.enum(['sprint', 'classic', 'deep_work', 'flow']).optional(),
});

router.patch(
  "/profile",
  requireAuth,
  validate(updateProfileSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const updates = req.body as z.infer<typeof updateProfileSchema>;
      const userId = req.userId!;

      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { isPrivate: true },
      });

      if (!currentUser) {
        res.status(404).json(apiError("USER_NOT_FOUND", "User not found."));
        return;
      }

      const wasPrivate = currentUser.isPrivate;
      const willBePublic = updates.isPrivate === false && wasPrivate;

      const user = await prisma.user.update({
        where: { id: userId },
        data: updates,
      });

      if (willBePublic) {
        await leaderboardQueue.add("sync-user", { userId }, {
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 }
        });
      }

      res.status(200).json({
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        utcOffset: user.utcOffset,
        isPrivate: user.isPrivate,
        default_variant: user.default_variant,
        createdAt: user.createdAt,
      });
    } catch (err: any) {
      console.error("Profile Error:", err);
      if (err?.name === "PrismaClientInitializationError" || err?.name === "PrismaClientKnownRequestError") {
        res.status(503).json({ status: "error", code: "SERVICE_UNAVAILABLE", message: "Database connection failed. Please try again." });
      } else {
        res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message: "An unexpected error occurred." });
      }
    }
  }
);
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'))
    }
  }
});

router.post('/avatar', requireAuth, avatarUpload.single('avatar'), async (req: Request, res: Response, next: any) => {
  try {
    const userId = req.userId!;
    const file = req.file;

    if (!file) {
      res.status(400).json({ status: 'error', code: 'NO_FILE', message: 'No image file provided.' });
      return;
    }

    const { data: buckets } = await supabaseAdmin.storage.listBuckets()
    const avatarBucket = buckets?.find(b => b.name === 'avatars')
    if (!avatarBucket) {
      await supabaseAdmin.storage.createBucket('avatars', { public: true })
    }

    const filePath = `${userId}`;

    await supabaseAdmin.storage.from('avatars').remove([filePath]);

    const { error: uploadError } = await supabaseAdmin.storage
      .from('avatars')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      res.status(500).json({ status: 'error', code: 'UPLOAD_FAILED', message: 'Failed to upload avatar.' });
      return;
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: publicUrl }
    });

    res.status(200).json({ status: 'success', data: { avatar_url: publicUrl } });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
});

router.use((err: any, req: Request, res: Response, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ status: 'error', code: 'FILE_TOO_LARGE', message: 'Image must be under 2MB.' });
      return;
    }
    res.status(400).json({ status: 'error', code: 'UPLOAD_ERROR', message: err.message });
    return;
  }
  if (err.message === 'Only JPEG, PNG, and WebP images are allowed') {
    res.status(400).json({ status: 'error', code: 'INVALID_FILE_TYPE', message: err.message });
    return;
  }
  next(err);
});

export default router;
