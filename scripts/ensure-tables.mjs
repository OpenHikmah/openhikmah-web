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

  // ─── Admin panel (curated VotD, audit log, feature flags, soft-disable) ─────
  await sql`
    CREATE TABLE IF NOT EXISTS curated_votd (
      date        date PRIMARY KEY,
      verse_ref   text NOT NULL,
      reflection  text,
      updated_by  text,
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id          bigserial PRIMARY KEY,
      admin_qf_id text NOT NULL,
      action      text NOT NULL,
      target_type text,
      target_id   text,
      meta        text,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_log (created_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS feature_flags (
      key        text PRIMARY KEY,
      value      text NOT NULL,
      updated_by text,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at timestamptz`;

  // ─── Challenge suggestions (admin-curated catalog) + attribution column ─────
  await sql`
    CREATE TABLE IF NOT EXISTS challenge_suggestions (
      id                 serial PRIMARY KEY,
      title              text NOT NULL,
      description        text,
      verse_ref          text,
      suggested_duration text,
      activity_type      text NOT NULL DEFAULT 'connection_made',
      is_active          boolean NOT NULL DEFAULT true,
      sort_order         integer NOT NULL DEFAULT 0,
      created_by         text,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS challenge_suggestions_active_idx ON challenge_suggestions (is_active, sort_order)`;
  await sql`ALTER TABLE challenges ADD COLUMN IF NOT EXISTS suggestion_id integer`;
  await sql`
    DO $$ BEGIN
      ALTER TABLE challenges ADD CONSTRAINT challenges_suggestion_id_challenge_suggestions_id_fk
        FOREIGN KEY (suggestion_id) REFERENCES challenge_suggestions(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS challenges_suggestion_id_idx ON challenges (suggestion_id)`;

  console.log("Tables ensured successfully");
} finally {
  await sql.end();
}
