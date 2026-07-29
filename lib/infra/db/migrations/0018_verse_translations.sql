CREATE TABLE "verse_translations" (
	"ref" text NOT NULL,
	"edition" text NOT NULL,
	"language" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verse_translations_ref_edition_pk" PRIMARY KEY("ref","edition")
);
--> statement-breakpoint
ALTER TABLE "verse_translations" ADD CONSTRAINT "verse_translations_ref_verses_ref_fk" FOREIGN KEY ("ref") REFERENCES "public"."verses"("ref") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verse_translations_edition_idx" ON "verse_translations" USING btree ("edition");