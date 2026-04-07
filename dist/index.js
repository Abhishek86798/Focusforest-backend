"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const stats_1 = __importDefault(require("./routes/stats"));
const trees_1 = __importDefault(require("./routes/trees"));
const groups_1 = __importDefault(require("./routes/groups"));
const leaderboard_1 = __importDefault(require("./routes/leaderboard"));
const timer_1 = __importDefault(require("./routes/timer"));
const userPreferences_1 = __importDefault(require("./routes/userPreferences"));
const midnightReset_1 = require("./jobs/midnightReset");
const app = (0, express_1.default)();
const PORT = process.env.PORT ?? 3000;
// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
// Support comma-separated origins in APP_URL, e.g. "https://myapp.com,http://localhost:5173"
const allowedOrigins = process.env.APP_URL
    ? process.env.APP_URL.split(",").map((o) => o.trim())
    : ["http://localhost:5173", "http://localhost:5174"];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin))
            return callback(null, true);
        // In development, allow any localhost port
        if (process.env.NODE_ENV !== "production" && /^http:\/\/localhost:\d+$/.test(origin)) {
            return callback(null, true);
        }
        callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
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
// Dev-only routes (disabled in production)
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
    app.post("/dev/reset-tree", async (req, res) => {
        try {
            const { email } = req.body;
            if (!email) {
                return res.status(400).json({ ok: false, error: "email is required" });
            }
            const { prisma } = await Promise.resolve().then(() => __importStar(require("./lib/prisma")));
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
        }
        catch (err) {
            res.status(500).json({ ok: false, error: String(err) });
        }
    });
    console.log("[dev] POST /dev/midnight-reset enabled (development mode).");
    console.log("[dev] POST /dev/reset-tree enabled (development mode).");
}
app.use("/api/v1/auth", auth_1.default);
app.use("/api/v1/sessions", sessions_1.default);
app.use("/api/v1/stats", stats_1.default);
app.use("/api/v1/trees", trees_1.default);
app.use("/api/v1/groups", groups_1.default);
app.use("/api/v1/leaderboard", leaderboard_1.default);
app.use("/api/v1/timer", timer_1.default);
app.use("/api/v1/user", userPreferences_1.default);
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