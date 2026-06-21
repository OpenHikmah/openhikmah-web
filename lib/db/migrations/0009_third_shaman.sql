CREATE TABLE IF NOT EXISTS "name_content" (
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	"data" text NOT NULL,
	"model" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "name_content_slug_kind_pk" PRIMARY KEY("slug","kind")
);
