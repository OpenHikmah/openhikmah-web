-- Rollback: DROP INDEX IF EXISTS "note_mentions_note_id_idx", "note_mentions_mentioning_user_id_idx";
-- (rate_limits_created_idx is NOT dropped on rollback: migration 0007 owns it; this migration only
-- records it in the schema/snapshot, hence IF NOT EXISTS below.)
CREATE INDEX IF NOT EXISTS "note_mentions_note_id_idx" ON "note_mentions" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "note_mentions_mentioning_user_id_idx" ON "note_mentions" USING btree ("mentioning_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limits_created_idx" ON "rate_limits" USING btree ("created_at");
