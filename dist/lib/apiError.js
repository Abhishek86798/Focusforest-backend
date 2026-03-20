"use strict";
// Standard error envelope for every API response.
// Per docs/ERRORS.md — never construct error responses manually.
//
// Usage:
//   res.status(404).json(apiError("NOT_FOUND", "Group not found."))
//   res.status(400).json(apiError("VALIDATION_ERROR", "Bad input.", { field: "reason" }))
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiError = apiError;
function apiError(code, message, details) {
    return {
        error: {
            code,
            message,
            ...(details ? { details } : {}),
        },
    };
}
//# sourceMappingURL=apiError.js.map