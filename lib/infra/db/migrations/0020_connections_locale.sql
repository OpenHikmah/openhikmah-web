-- High-risk migration: DROP INDEX/CREATE UNIQUE INDEX below briefly block writes
-- to "connections" (ACCESS EXCLUSIVE / blocks-writes locks respectively). Not run
-- CONCURRENTLY because scripts/migrate.mjs applies all pending migrations through
-- drizzle's migrator, which wraps them in a single transaction — CONCURRENTLY
-- cannot execute inside a transaction block. Acceptable at current table size;
-- revisit with an out-of-transaction runner if "connections" grows large enough
-- for the lock window to matter.
DROP INDEX "connections_from_to_kind_idx";--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "connections_from_to_kind_locale_idx" ON "connections" USING btree ("from_ref","to_ref","kind","locale");