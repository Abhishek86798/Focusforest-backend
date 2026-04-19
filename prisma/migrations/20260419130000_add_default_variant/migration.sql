-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "default_variant" TEXT DEFAULT 'classic';
