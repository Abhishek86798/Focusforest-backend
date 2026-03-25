-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('active', 'completed', 'abandoned');

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "abandoned_at" TIMESTAMP(3),
ADD COLUMN     "expected_end_at" TIMESTAMP(3),
ADD COLUMN     "started_at" TIMESTAMP(3),
ADD COLUMN     "state" "SessionState" NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE INDEX "sessions_user_id_state_idx" ON "sessions"("user_id", "state");
