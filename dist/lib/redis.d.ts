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
    var __redis: Redis | undefined;
}
export declare const redis: Redis;
//# sourceMappingURL=redis.d.ts.map