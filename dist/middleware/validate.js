"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
const apiError_1 = require("../lib/apiError");
// Wraps any route in Zod validation.
// On failure → 400 VALIDATION_ERROR with per-field detail.
// On success → req.body is replaced with the parsed (typed) value.
//
// Usage:
//   router.post("/sessions", validate(sessionSchema), handler)
function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const details = {};
            const flat = result.error.flatten();
            // Field-level errors
            for (const [field, msgs] of Object.entries(flat.fieldErrors)) {
                if (Array.isArray(msgs) && msgs.length > 0) {
                    details[field] = msgs[0];
                }
            }
            // Root-level errors
            if (flat.formErrors.length > 0) {
                details["root"] = flat.formErrors[0];
            }
            res
                .status(400)
                .json((0, apiError_1.apiError)("VALIDATION_ERROR", "Request body is invalid.", details));
            return;
        }
        req.body = result.data;
        next();
    };
}
//# sourceMappingURL=validate.js.map