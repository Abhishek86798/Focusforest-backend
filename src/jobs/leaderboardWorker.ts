import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue";
import { updateSoloLeaderboard } from "../services/leaderboardService";

export const leaderboardWorker = new Worker(
  "leaderboard-sync",
  async (job) => {
    const { userId } = job.data;
    if (!userId) throw new Error("Missing userId in payload");
    console.log(`[Worker] Running leaderboard sync for user ${userId}`);
    await updateSoloLeaderboard(userId);
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

leaderboardWorker.on("completed", (job) => {
  console.log(`[Worker] Successfully synced leaderboard for Job ID: ${job.id}`);
});

leaderboardWorker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed with error:`, err);
});
