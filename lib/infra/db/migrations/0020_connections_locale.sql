-- The index transition for "connections" (dropping connections_from_to_kind_idx,
-- creating connections_from_to_kind_locale_idx) is deliberately NOT here — this
-- migration runs through drizzle's migrator (scripts/migrate.mjs), which wraps
-- all pending migrations in a single transaction, and CONCURRENTLY cannot
-- execute inside a transaction block. That transition runs separately and
-- non-transactionally via scripts/migrate-concurrent-indexes.mjs, invoked right
-- after this migration in scripts/deploy.sh and CI.
ALTER TABLE "connections" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;
