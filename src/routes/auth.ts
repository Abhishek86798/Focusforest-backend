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
        utcOffset: user.utcOffset,
        isPrivate: user.isPrivate,
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
