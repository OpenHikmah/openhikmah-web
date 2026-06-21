/**
 * Idempotent table creation — runs after migrate.mjs on every container start.
 * Bypasses Drizzle's migration tracking so it always executes regardless of
 * what __drizzle_migrations thinks has been applied.
 */
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id         serial PRIMARY KEY,
      user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      verse_ref  text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT bookmarks_user_ref_uniq UNIQUE (user_id, verse_ref)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS bookmarks_user_idx ON bookmarks (user_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS verse_notes (
      id         serial PRIMARY KEY,
      user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      verse_ref  text NOT NULL,
      note       text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS verse_notes_user_ref_idx ON verse_notes (user_id, verse_ref)`;

  await sql`
    CREATE TABLE IF NOT EXISTS saved_workspaces (
      id         serial PRIMARY KEY,
      user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       text NOT NULL,
      data       text NOT NULL,
      node_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS saved_workspaces_user_idx ON saved_workspaces (user_id)`;

  // ─── Connection graph (foundation phase) ────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS verses (
      ref               text PRIMARY KEY,
      surah             integer NOT NULL,
      ayah              integer NOT NULL,
      arabic_text       text NOT NULL,
      translation       text NOT NULL,
      transliteration   text,
      created_at        timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS verses_surah_ayah_idx ON verses (surah, ayah)`;

  await sql`
    CREATE TABLE IF NOT EXISTS connections (
      id         serial PRIMARY KEY,
      from_ref   text NOT NULL,
      to_ref     text NOT NULL,
      kind       text NOT NULL,
      reason     text NOT NULL,
      model      text,
      confidence integer,
      status     text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS connections_from_to_kind_idx ON connections (from_ref, to_ref, kind)`;
  await sql`CREATE INDEX IF NOT EXISTS connections_from_kind_idx ON connections (from_ref, kind)`;

  await sql`
    CREATE TABLE IF NOT EXISTS ai_generations (
      id         bigserial PRIMARY KEY,
      from_ref   text NOT NULL,
      kind       text NOT NULL,
      model      text,
      tokens     integer,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS ai_generations_created_idx ON ai_generations (created_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key        text PRIMARY KEY,
      count      integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS rate_limits_created_idx ON rate_limits (created_at)`;

  // ─── Semantic search + grounded discovery (this phase) ──────────────────────
  // pgvector must be available in the Postgres image (pgvector/pgvector:pg16).
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`
    CREATE TABLE IF NOT EXISTS verse_embeddings (
      ref        text PRIMARY KEY,
      embedding  vector(768) NOT NULL,
      model      text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS verse_embeddings_hnsw_idx ON verse_embeddings USING hnsw (embedding vector_cosine_ops)`;

  await sql`
    CREATE TABLE IF NOT EXISTS word_morphology (
      id        bigserial PRIMARY KEY,
      ref       text NOT NULL,
      position  integer NOT NULL,
      surface   text NOT NULL,
      root      text,
      lemma     text
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS word_morphology_ref_pos_idx ON word_morphology (ref, position)`;
  await sql`CREATE INDEX IF NOT EXISTS word_morphology_ref_idx ON word_morphology (ref)`;
  await sql`CREATE INDEX IF NOT EXISTS word_morphology_root_idx ON word_morphology (root)`;

  // ─── 99-Names AI content cache (durable, write-once/read-many) ──────────────
  await sql`
    CREATE TABLE IF NOT EXISTS name_content (
      slug       text NOT NULL,
      kind       text NOT NULL,
      data       text NOT NULL,
      model      text,
      version    integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (slug, kind)
    )
  `;

  console.log("Tables ensured successfully");
} finally {
  await sql.end();
}
