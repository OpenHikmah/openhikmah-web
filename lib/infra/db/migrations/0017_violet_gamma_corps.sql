CREATE TABLE "note_mentions" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer NOT NULL,
	"mentioning_user_id" integer NOT NULL,
	"mentioned_user_id" integer NOT NULL,
	"verse_ref" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note_mentions" ADD CONSTRAINT "note_mentions_note_id_verse_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."verse_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_mentions" ADD CONSTRAINT "note_mentions_mentioning_user_id_users_id_fk" FOREIGN KEY ("mentioning_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_mentions" ADD CONSTRAINT "note_mentions_mentioned_user_id_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_mentions_mentioned_user_read_idx" ON "note_mentions" USING btree ("mentioned_user_id","read");