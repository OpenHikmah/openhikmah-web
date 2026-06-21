-- Challenge suggestions (admin-curated catalog) + attribution column on challenges.
-- Hand-edited to be idempotent (IF NOT EXISTS / guarded constraint) in the same
-- style as the other migrations and scripts/ensure-tables.mjs.

CREATE TABLE IF NOT EXISTS "challenge_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"verse_ref" text,
	"suggested_duration" text,
	"activity_type" text DEFAULT 'connection_made' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "challenge_suggestions_active_idx" ON "challenge_suggestions" USING btree ("is_active","sort_order");
--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "suggestion_id" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "challenges" ADD CONSTRAINT "challenges_suggestion_id_challenge_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."challenge_suggestions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
