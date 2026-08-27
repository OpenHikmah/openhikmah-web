CREATE TABLE "connection_coverage" (
	"from_ref" text NOT NULL,
	"kind" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"active_count" integer DEFAULT 0 NOT NULL,
	"exhausted_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_coverage_from_ref_kind_locale_pk" PRIMARY KEY("from_ref","kind","locale")
);
--> statement-breakpoint
CREATE INDEX "connection_coverage_kind_locale_idx" ON "connection_coverage" USING btree ("kind","locale");--> statement-breakpoint
CREATE INDEX "connection_coverage_exhausted_idx" ON "connection_coverage" USING btree ("kind","locale") WHERE "connection_coverage"."exhausted_at" is not null;