/**
 * Pre-warms the connection graph offline so live users hit a warm cache.
 *
 * Walks verses from the local corpus and, for any (verse, kind) not already in
 * `connections`, calls the running app's /api/connections endpoint to generate
 * and persist the edges. Idempotent and resumable: already-warmed pairs are
 * skipped, so it is safe to re-run and to stop/restart.
 *
 *   APP_URL=https://openhikmah.com \
 *   DATABASE_URL=... \
 *   node scripts/prewarm-graph.mjs [limit]
 *
 * `limit` (optional) caps how many verses to process this run (default 200),
 * keeping one-time AI spend bounded. Run repeatedly to warm more over time.
 */
import postgres from "postgres";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const KINDS = ["thematic", "root", "contrast"];
const LIMIT = Number(process.argv[2] ?? process.env.PREWARM_LIMIT ?? 200);
const DELAY_MS = Number(process.env.PREWARM_DELAY_MS ?? 250);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let generated = 0;
let skipped = 0;
let failed = 0;

try {
  // Popular surahs first (Al-Fatiha, Ya-Sin, Al-Mulk, Al-Kahf, Al-Baqarah …),
  // then the rest in order, so the most-visited verses warm first.
  const popular = [1, 36, 67, 18, 2, 112, 55, 56];
  const verses = await sql`
    SELECT ref, surah, ayah, arabic_text, translation
    FROM verses
    ORDER BY (surah = ANY(${sql.array(popular)})) DESC, surah, ayah
    LIMIT ${LIMIT}
  `;

  if (verses.length === 0) {
    console.error("No verses in corpus — run scripts/seed-quran.mjs first.");
    process.exit(1);
  }

  console.log(`Pre-warming up to ${verses.length} verses × ${KINDS.length} kinds via ${APP_URL}…`);

  for (const v of verses) {
    for (const kind of KINDS) {
      const [{ exists }] = await sql`
        SELECT EXISTS (
          SELECT 1 FROM connections
          WHERE from_ref = ${v.ref} AND kind = ${kind} AND status = 'active'
        ) AS exists
      `;
      if (exists) {
        skipped++;
        continue;
      }

      try {
        const res = await fetch(`${APP_URL}/api/connections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromRef: v.ref,
            kind,
            arabicText: v.arabic_text,
            translation: v.translation,
          }),
        });
        if (res.ok) {
          generated++;
          console.log(`  ✓ ${v.ref} ${kind}`);
        } else {
          failed++;
          console.warn(`  ✗ ${v.ref} ${kind} → HTTP ${res.status}`);
        }
      } catch (err) {
        failed++;
        console.warn(`  ✗ ${v.ref} ${kind} → ${err.message}`);
      }

      await sleep(DELAY_MS);
    }
  }

  console.log(`Done. generated=${generated} skipped=${skipped} failed=${failed}`);
} finally {
  await sql.end();
}
