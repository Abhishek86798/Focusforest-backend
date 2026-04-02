import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import sessionsRouter from "./routes/sessions";
import authRouter from "./routes/auth";
import treesRouter from "./routes/trees";
import groupsRouter from "./routes/groups";
import leaderboardRouter from "./routes/leaderboard";
import { startMidnightCron, runMidnightReset } from "./jobs/midnightReset";

const app = express();
const PORT = process.env.PORT ?? 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
// Support comma-separated origins in APP_URL, e.g. "https://myapp.com,http://localhost:5173"
const allowedOrigins: string[] = process.env.APP_URL
  ? process.env.APP_URL.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "http://localhost:5174"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // In development, allow any localhost port
      if (process.env.NODE_ENV !== "production" && /^http:\/\/localhost:\d+$/.test(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true, // required for httpOnly cookies
  })
);
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Dev-only routes (disabled in production)
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== "production") {
  app.post("/dev/midnight-reset", async (_req, res) => {
    try {
      await runMidnightReset();
      res.json({ ok: true, message: "Midnight reset ran successfully. Check server logs." });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  
  app.post("/dev/reset-tree", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ ok: false, error: "email is required" });
      }
      
      const { prisma } = await import("./lib/prisma");
      
      // Find user
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return res.status(404).json({ ok: false, error: "User not found" });
      }
      
      // Calculate today's date in user's timezone
      const now = new Date();
      const offsetMinutes = user.utcOffset;
      const localDate = new Date(now.getTime() + offsetMinutes * 60 * 1000);
      const dateStr = localDate.toISOString().split("T")[0];
      
      // Delete today's tree and all sessions for today
      await prisma.dailyTree.deleteMany({
        where: { userId: user.id, date: dateStr }
      });
      
      await prisma.session.deleteMany({
        where: {
          userId: user.id,
          createdAt: {
            gte: new Date(dateStr + "T00:00:00.000Z"),
            lt: new Date(new Date(dateStr).getTime() + 24 * 60 * 60 * 1000)
          }
        }
      });
      
      res.json({ 
        ok: true, 
        message: `Reset tree and sessions for ${email} on ${dateStr}` 
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  
  console.log("[dev] POST /dev/midnight-reset enabled (development mode).");
  console.log("[dev] POST /dev/reset-tree enabled (development mode).");
}

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/sessions", sessionsRouter);
app.use("/api/v1/trees", treesRouter);
app.use("/api/v1/groups", groupsRouter);
app.use("/api/v1/leaderboard", leaderboardRouter);

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Route not found." },
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`FocusForest API running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV ?? "development"}`);
  startMidnightCron();
});

export default app;
