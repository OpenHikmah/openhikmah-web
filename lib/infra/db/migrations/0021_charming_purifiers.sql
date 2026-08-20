CREATE TABLE "story_flags" (
	"slug" text PRIMARY KEY NOT NULL,
	"reason" text,
	"flagged_by" text,
	"flagged_at" timestamp with time zone DEFAULT now() NOT NULL
);
