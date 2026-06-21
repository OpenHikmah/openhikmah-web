-- Admin panel: curated Verse-of-the-Day, audit log, feature flags, and a
-- soft-disable column on users. Hand-written to add only the new objects
-- (drizzle-kit's full snapshot baseline is stale for 0002–0009), idempotent in
-- the same style as the existing migrations / scripts/ensure-tables.mjs.

CREATE TABLE IF NOT EXISTS "curated_votd" (
	"date" date PRIMARY KEY NOT NULL,
	"verse_ref" text NOT NULL,
	"reflection" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"admin_qf_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"meta" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_created_idx" ON "admin_audit_log" USING btree ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "disabled_at" timestamp with time zone;
