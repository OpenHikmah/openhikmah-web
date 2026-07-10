CREATE TABLE "prompt_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"template" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "prompt_version" integer;--> statement-breakpoint
CREATE INDEX "prompt_versions_key_idx" ON "prompt_versions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "prompt_versions_key_active_idx" ON "prompt_versions" USING btree ("key","active");