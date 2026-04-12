import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { apiError } from "../lib/apiError";
import { isTokenRevoked } from "../lib/tokenBlocklist";

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (req.cookies && req.cookies["sb-access-token"]) {
    token = req.cookies["sb-access-token"];
  }

  if (!token) {
    res.status(401).json(apiError("UNAUTHORIZED", "Authentication required."));
    return;
  }

  const revoked = await isTokenRevoked(token);
  if (revoked) {
    res.status(401).json(apiError("UNAUTHORIZED", "Session revoked. Please log in again."));
    return;
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    res.status(401).json(apiError("UNAUTHORIZED", "Invalid or expired token."));
    return;
  }

  req.userId = user.id;
  next();
}
