import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { apiError } from "../lib/apiError";

// Wraps any route in Zod validation.
// On failure → 400 VALIDATION_ERROR with per-field detail.
// On success → req.body is replaced with the parsed (typed) value.
//
// Usage:
//   router.post("/sessions", validate(sessionSchema), handler)

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details: Record<string, string> = {};
      const flat = result.error.flatten();

      // Field-level errors
      for (const [field, msgs] of Object.entries(flat.fieldErrors)) {
        if (Array.isArray(msgs) && msgs.length > 0) {
          details[field] = msgs[0] as string;
        }
      }
      // Root-level errors
      if (flat.formErrors.length > 0) {
        details["root"] = flat.formErrors[0];
      }

      res
        .status(400)
        .json(apiError("VALIDATION_ERROR", "Request body is invalid.", details));
      return;
    }

    req.body = result.data;
    next();
  };
}
