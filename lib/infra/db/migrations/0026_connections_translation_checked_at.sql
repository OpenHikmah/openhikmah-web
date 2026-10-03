-- Rollback: ALTER TABLE "connections" DROP COLUMN IF EXISTS "translation_checked_at";
ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "translation_checked_at" timestamp with time zone;
