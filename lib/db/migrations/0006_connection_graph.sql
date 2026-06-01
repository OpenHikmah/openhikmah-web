CREATE TABLE IF NOT EXISTS "verses" (
	"ref" text PRIMARY KEY NOT NULL,
	"surah" integer NOT NULL,
	"ayah" integer NOT NULL,
	"arabic_text" text NOT NULL,
	"translation" text NOT NULL,
	"transliteration" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "verses_surah_ayah_idx" ON "verses" USING btree ("surah","ayah");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_ref" text NOT NULL,
	"to_ref" text NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"model" text,
	"confidence" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connections_from_to_kind_idx" ON "connections" USING btree ("from_ref","to_ref","kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connections_from_kind_idx" ON "connections" USING btree ("from_ref","kind");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_generations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"from_ref" text NOT NULL,
	"kind" text NOT NULL,
	"model" text,
	"tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_generations_created_idx" ON "ai_generations" USING btree ("created_at");
