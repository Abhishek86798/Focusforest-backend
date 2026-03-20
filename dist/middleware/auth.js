"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const supabase_1 = require("../lib/supabase");
const apiError_1 = require("../lib/apiError");
// Verifies the Supabase JWT from the Authorization: Bearer header.
// On success → attaches req.userId and calls next().
// On failure → 401 UNAUTHORIZED.
//
// Usage:
//   router.post("/sessions", requireAuth, validate(schema), handler)
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        res
            .status(401)
            .json((0, apiError_1.apiError)("UNAUTHORIZED", "Authentication required. Please log in."));
        return;
    }
    const token = authHeader.slice(7); // strip "Bearer "
    const { data: { user }, error, } = await supabase_1.supabaseAdmin.auth.getUser(token);
    if (error || !user) {
        res
            .status(401)
            .json((0, apiError_1.apiError)("UNAUTHORIZED", "Invalid or expired token. Please log in again."));
        return;
    }
    req.userId = user.id;
    next();
}
//# sourceMappingURL=auth.js.map