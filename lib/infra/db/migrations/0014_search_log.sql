CREATE TABLE "search_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"mode" text NOT NULL,
	"result_count" integer NOT NULL,
	"zero_result" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "search_log_created_idx" ON "search_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "search_log_zero_result_idx" ON "search_log" USING btree ("zero_result","created_at");