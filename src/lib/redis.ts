import { Redis } from "@upstash/redis";

/**
 * Upstash Redis client singleton.
 *
 * Uses the REST-based @upstash/redis client, which works natively in
 * serverless and traditional Node environments without a persistent TCP
 * connection. Safe to import anywhere — the singleton is reused across
 * module reloads in ts-node-dev (global guard pattern).
 */

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

export const redis: Redis =
  global.__redis ??
  (global.__redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }));
