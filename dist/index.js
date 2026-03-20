"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const sessions_1 = __importDefault(require("./routes/sessions"));
const auth_1 = __importDefault(require("./routes/auth"));
const trees_1 = __importDefault(require("./routes/trees"));
const groups_1 = __importDefault(require("./routes/groups"));
const leaderboard_1 = __importDefault(require("./routes/leaderboard"));
const midnightReset_1 = require("./jobs/midnightReset");
const app = (0, express_1.default)();
const PORT = process.env.PORT ?? 3000;
// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use((0, cors_1.default)({
    origin: process.env.APP_URL ?? "http://localhost:5173",
    credentials: true, // required for httpOnly cookies
}));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)(process.env.COOKIE_SECRET));
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
            await (0, midnightReset_1.runMidnightReset)();
            res.json({ ok: true, message: "Midnight reset ran successfully. Check server logs." });
        }
        catch (err) {
            res.status(500).json({ ok: false, error: String(err) });
        }
    });
    console.log("[dev] POST /dev/midnight-reset enabled (development mode).");
}
app.use("/api/v1/auth", auth_1.default);
app.use("/api/v1/sessions", sessions_1.default);
app.use("/api/v1/trees", trees_1.default);
app.use("/api/v1/groups", groups_1.default);
app.use("/api/v1/leaderboard", leaderboard_1.default);
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
    (0, midnightReset_1.startMidnightCron)();
});
exports.default = app;
//# sourceMappingURL=index.js.map