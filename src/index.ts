import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import sessionsRouter from "./routes/sessions";
import authRouter from "./routes/auth";
import treesRouter from "./routes/trees";

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

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/sessions", sessionsRouter);
app.use("/api/v1/trees", treesRouter);

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
});

export default app;
