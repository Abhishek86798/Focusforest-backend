import { Queue } from "bullmq";
import Redis from "ioredis";

export const redisConnection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  // Prevents the terminal being flooded with connection errors when Redis
  // is unreachable from the local network (e.g., behind a firewall).
  lazyConnect: true,
  connectTimeout: 5000,
  retryStrategy: (times: number) => {
    // Back off: 1s, 2s, 4s, ... up to 60s max
    return Math.min(2 ** (times - 1) * 1000, 60000);
  },
  reconnectOnError: () => false,
});

let _redisErrLogged = false;
redisConnection.on("error", (err: any) => {
  if (!_redisErrLogged) {
    _redisErrLogged = true;
    console.warn(`⚠️  Redis unavailable (${err.code}) — BullMQ queues disabled. Retrying in background.`);
  }
});

export const leaderboardQueue = new Queue("leaderboard-sync", {
  connection: redisConnection,
});


