ALTER TABLE "connections" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
CREATE INDEX "connections_reviewed_at_idx" ON "connections" USING btree ("reviewed_at");