CREATE TABLE "name_verse_reasons" (
	"slug" text NOT NULL,
	"ref" text NOT NULL,
	"locale" text NOT NULL,
	"reason" text NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "name_verse_reasons_slug_ref_locale_pk" PRIMARY KEY("slug","ref","locale")
);
--> statement-breakpoint
ALTER TABLE "name_content" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "name_content" DROP CONSTRAINT "name_content_slug_kind_pk";--> statement-breakpoint
ALTER TABLE "name_content" ADD CONSTRAINT "name_content_slug_kind_locale_pk" PRIMARY KEY("slug","kind","locale");