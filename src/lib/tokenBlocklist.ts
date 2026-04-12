import { redisConnection } from "./queue";
import jwt from "jsonwebtoken";

export async function revokeToken(token: string): Promise<void> {
  try {
    const decoded = jwt.decode(token) as jwt.JwtPayload | null;
    if (!decoded || !decoded.jti || !decoded.exp) return;
    const expiresInMs = (decoded.exp * 1000) - Date.now();
    if (expiresInMs <= 0) return;
    await redisConnection.setex(
      `bl_${decoded.jti}`, 
      Math.ceil(expiresInMs / 1000), 
      "revoked"
    );
  } catch (err) {
    console.error("Token revocation decode failure:", err);
  }
}

export async function isTokenRevoked(token: string): Promise<boolean> {
  try {
    const decoded = jwt.decode(token) as jwt.JwtPayload | null;
    if (!decoded || !decoded.jti) return false;
    const exists = await redisConnection.exists(`bl_${decoded.jti}`);
    return exists === 1;
  } catch (err) {
    console.error("Redis blocklist check failure:", err);
    return false;
  }
}
