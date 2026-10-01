/**
 * One-off, non-transactional companion to migration 0020_connections_locale.sql.
 * CREATE INDEX CONCURRENTLY / DROP INDEX CONCURRENTLY cannot run inside a
 * transaction block, but scripts/migrate.mjs applies every pending migration
 * through drizzle's migrator in a single transaction — so this index
 * transition runs here instead, as its own step, after migrate.mjs.
 *
 * CONCURRENTLY avoids taking the ACCESS EXCLUSIVE / blocks-writes locks a plain
 * DROP INDEX / CREATE INDEX would hold on "connections" for the duration of
 * the build. Create-before-drop so the table is never left without a unique
 * constraint on (from_ref, to_ref, kind[, locale]) mid-transition.
 *
 * Idempotent (IF NOT EXISTS / IF EXISTS) — safe to run on a database where
 * this has already been applied, or where 0020 hasn't run yet (no-ops until
 * the "locale" column exists).
 *
 * A failed CREATE INDEX CONCURRENTLY leaves the new index behind as INVALID,
 * and IF NOT EXISTS would then skip rebuilding it. So validity is checked via
 * pg_index.indisvalid: an invalid leftover is dropped and rebuilt, and the old
 * index is only dropped once the new one is confirmed valid.
 */
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const NEW_INDEX = "connections_from_to_kind_locale_idx";

/** `true`/`false` for the new index's pg_index.indisvalid, `null` when absent. */
async function newIndexValidity() {
  const [row] = await sql`
    SELECT i.indisvalid
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = ${NEW_INDEX} AND pg_catalog.pg_table_is_visible(c.oid)
  `;
  return row ? row.indisvalid : null;
}

try {
  const [{ has_locale }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'connections' AND column_name = 'locale'
    ) AS has_locale
  `;
  if (!has_locale) {
    console.log("connections.locale column not present yet — skipping index transition");
  } else {
    if ((await newIndexValidity()) === false) {
      console.log(`${NEW_INDEX} exists but is INVALID (an earlier build failed) — rebuilding`);
      await sql`DROP INDEX CONCURRENTLY IF EXISTS connections_from_to_kind_locale_idx`;
    }
    await sql`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS connections_from_to_kind_locale_idx
      ON connections (from_ref, to_ref, kind, locale)
    `;
    if ((await newIndexValidity()) !== true) {
      throw new Error(`${NEW_INDEX} is not valid after build — keeping the old index`);
    }
    await sql`DROP INDEX CONCURRENTLY IF EXISTS connections_from_to_kind_idx`;
    console.log("connections index transition complete");
  }
} finally {
  await sql.end();
}
