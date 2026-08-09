DROP INDEX "connections_from_to_kind_idx";--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "connections_from_to_kind_locale_idx" ON "connections" USING btree ("from_ref","to_ref","kind","locale");