-- Rollback: ALTER TABLE "connection_coverage" DROP COLUMN IF EXISTS "verified_at";
ALTER TABLE "connection_coverage" ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone;
