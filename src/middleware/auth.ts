import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { apiError } from "../lib/apiError";

// Extend Express Request to carry the verified userId downstream.
declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

// Verifies the Supabase JWT from the Authorization: Bearer header.
// On success → attaches req.userId and calls next().
// On failure → 401 UNAUTHORIZED.
//
// Usage:
//   router.post("/sessions", requireAuth, validate(schema), handler)

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7); // strip "Bearer "
  } else if (req.cookies && req.cookies["sb-access-token"]) {
    token = req.cookies["sb-access-token"];
  }

  if (!token) {
    res
      .status(401)
      .json(apiError("UNAUTHORIZED", "Authentication required. Please log in."));
    return;
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    res
      .status(401)
      .json(apiError("UNAUTHORIZED", "Invalid or expired token. Please log in again."));
    return;
  }

  req.userId = user.id;
  next();
}
