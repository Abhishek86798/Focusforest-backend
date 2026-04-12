import { Queue } from "bullmq";
import Redis from "ioredis";

export const redisConnection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

redisConnection.on("error", (err) => {
  console.error("IoRedis connection error for BullMQ:", err);
});

export const leaderboardQueue = new Queue("leaderboard-sync", {
  connection: redisConnection,
});
