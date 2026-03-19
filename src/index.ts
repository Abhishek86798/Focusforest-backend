import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import sessionsRouter from "./routes/sessions";
import authRouter from "./routes/auth";
import treesRouter from "./routes/trees";
import groupsRouter from "./routes/groups";
import { startMidnightCron, runMidnightReset } from "./jobs/midnightReset";

const app = express();
const PORT = process.env.PORT ?? 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(
  cors({
    origin: process.env.APP_URL ?? "http://localhost:5173",
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
// Dev-only route — manual midnight reset trigger (disabled in production)
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
  console.log("[dev] POST /dev/midnight-reset enabled (development mode).");
}

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/sessions", sessionsRouter);
app.use("/api/v1/trees", treesRouter);
app.use("/api/v1/groups", groupsRouter);

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
