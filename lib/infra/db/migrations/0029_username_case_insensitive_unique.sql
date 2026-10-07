-- Rollback: DROP INDEX IF EXISTS "users_username_lower_idx"; ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE ("username"); CREATE UNIQUE INDEX IF NOT EXISTS "users_username_idx" ON "users" USING btree ("username"); (usernames renamed below are not reverted)
-- Usernames were unique case-sensitively but looked up case-insensitively, so "Alice" and
-- "alice" could both exist. Resolve any existing collision first so the index below can be
-- built: the oldest account keeps the name, every newer one gets "_<id>" appended (truncated
-- to the 20-char username limit).
UPDATE "users" u
SET "username" = left(u."username", 20 - length('_' || u."id"::text)) || '_' || u."id"::text
WHERE EXISTS (
  SELECT 1 FROM "users" o
  WHERE lower(o."username") = lower(u."username") AND o."id" < u."id"
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_lower_idx" ON "users" USING btree (lower("username"));--> statement-breakpoint
-- The case-sensitive column UNIQUE and users_username_idx were duplicates of each other and
-- are both implied by the case-insensitive index above.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_username_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "users_username_idx";
