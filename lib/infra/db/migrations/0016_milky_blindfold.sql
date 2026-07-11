CREATE TABLE "job_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_type" text NOT NULL,
	"status" text NOT NULL,
	"triggered_by" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error" text,
	"log_tail" text
);
--> statement-breakpoint
CREATE INDEX "job_runs_type_started_idx" ON "job_runs" USING btree ("job_type","started_at");