import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { addMinutes, startOfDay } from "date-fns";

import "./jobs/leaderboardWorker";

import sessionsRouter from "./routes/sessions";
import authRouter from "./routes/auth";
import statsRouter from "./routes/stats";
import treesRouter from "./routes/trees";
import groupsRouter from "./routes/groups";
import leaderboardRouter from "./routes/leaderboard";
import timerRouter from "./routes/timer";
import userPreferencesRouter from "./routes/userPreferences";
import { startMidnightCron, runMidnightReset } from "./jobs/midnightReset";
import { apiError } from "./lib/apiError";

const app = express();
const PORT = process.env.PORT ?? 3000;

const allowedOrigins: string[] = process.env.APP_URL
  ? process.env.APP_URL.split(",").map((o) => o.trim())
  : [];

if (process.env.NODE_ENV !== "production") {
  allowedOrigins.push("http://localhost:5173", "http://localhost:5174");
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (allowedOrigins.includes(origin as string)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const requireAdminOrDev = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json(apiError("FORBIDDEN", "Endpoint strictly disabled in production."));
    return;
  }
  const devToken = req.headers.authorization?.replace("Bearer ", "");
  if (!devToken || devToken !== process.env.DEV_SECRET_TOKEN) {
    res.status(403).json(apiError("FORBIDDEN", "Invalid or missing dev token."));
    return;
  }
  next();
};

app.post("/dev/midnight-reset", requireAdminOrDev, async (_req, res) => {
  try {
    await runMidnightReset();
    res.json({ ok: true, message: "Midnight reset ran successfully. Check server logs." });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post("/dev/reset-tree", requireAdminOrDev, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ ok: false, error: "email is required" });
      return;
    }
    
    const { prisma } = await import("./lib/prisma");
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ ok: false, error: "User not found" });
      return;
    }
    
    const userLocalTime = addMinutes(new Date(), user.utcOffset);
    const currentLocalDay = startOfDay(userLocalTime);
    const dateStr = currentLocalDay.toISOString().split("T")[0];
    
    await prisma.dailyTree.deleteMany({
      where: { userId: user.id, date: currentLocalDay }
    });
    
    await prisma.session.deleteMany({
      where: {
        userId: user.id,
        createdAt: {
          gte: addMinutes(currentLocalDay, -user.utcOffset),
          lt: addMinutes(currentLocalDay, 24 * 60 - user.utcOffset)
        }
      }
    });
    
    res.json({ ok: true, message: `Reset tree and sessions for ${email} on ${dateStr}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/sessions", sessionsRouter);
app.use("/api/v1/stats", statsRouter);
app.use("/api/v1/trees", treesRouter);
app.use("/api/v1/groups", groupsRouter);
app.use("/api/v1/leaderboard", leaderboardRouter);
app.use("/api/v1/timer", timerRouter);
app.use("/api/v1/user", userPreferencesRouter);

app.use((_req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Route not found." },
  });
});

app.listen(PORT, () => {
  console.log(`FocusForest API running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV ?? "development"}`);
  startMidnightCron();
});

export default app;
