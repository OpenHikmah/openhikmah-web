-- Rollback: ALTER TABLE "name_content" DROP COLUMN IF EXISTS "source_hash"; ALTER TABLE "name_verse_reasons" DROP COLUMN IF EXISTS "source_hash";
ALTER TABLE "name_content" ADD COLUMN IF NOT EXISTS "source_hash" text;--> statement-breakpoint
ALTER TABLE "name_verse_reasons" ADD COLUMN IF NOT EXISTS "source_hash" text;
