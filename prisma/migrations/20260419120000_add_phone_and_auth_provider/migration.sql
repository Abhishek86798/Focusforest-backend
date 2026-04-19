-- AlterTable (safe idempotent statements)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_provider" TEXT DEFAULT 'email';

-- CreateIndex (safe idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone");
