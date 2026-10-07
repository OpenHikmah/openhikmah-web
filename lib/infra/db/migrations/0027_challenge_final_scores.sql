-- Rollback: ALTER TABLE "challenges" DROP COLUMN IF EXISTS "challenger_score", DROP COLUMN IF EXISTS "challenged_score";
ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "challenger_score" integer;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "challenged_score" integer;
