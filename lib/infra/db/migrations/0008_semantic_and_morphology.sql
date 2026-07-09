CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verse_embeddings" (
	"ref" text PRIMARY KEY NOT NULL,
	"embedding" vector(768) NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verse_embeddings_hnsw_idx" ON "verse_embeddings" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "word_morphology" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"position" integer NOT NULL,
	"surface" text NOT NULL,
	"root" text,
	"lemma" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "word_morphology_ref_pos_idx" ON "word_morphology" USING btree ("ref","position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "word_morphology_ref_idx" ON "word_morphology" USING btree ("ref");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "word_morphology_root_idx" ON "word_morphology" USING btree ("root");
