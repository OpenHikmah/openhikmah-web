/**
 * Seeds the `verse_translations` table: backfills `en.sahih` from the existing
 * `verses.translation` column, then pulls the default Turkish/Russian/
 * Azerbaijani editions from alquran.cloud. Idempotent: safe to re-run.
 *
 * Unlike scripts/seed-quran.mjs, this asserts exactly 6236 ayahs per edition
 * and aborts without writing anything for that edition if the count is off —
 * multi-language epic requirement, since a partial edition would silently
 * degrade to English mid-Quran for affected verses.
 *
 *   DATABASE_URL=... node scripts/seed-translations.mjs
 */
import postgres from "postgres";

const EXPECTED_AYAH_COUNT = 6236;

const EDITIONS = [
  { edition: "tr.diyanet", language: "tr" },
  { edition: "ru.kuliev", language: "ru" },
  { edition: "az.mammadaliyev", language: "az" },
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

async function fetchEdition(edition) {
  const res = await fetch(`https://api.alquran.cloud/v1/quran/${edition}`);
  if (!res.ok) throw new Error(`Failed to fetch edition ${edition}: ${res.status}`);
  const json = await res.json();
  if (!json?.data?.surahs) throw new Error(`Malformed response for edition ${edition}`);
  return json.data.surahs;
}

function toRows(surahs, edition, language) {
  const rows = [];
  for (const surah of surahs) {
    for (const ayah of surah.ayahs) {
      rows.push({
        ref: `${surah.number}:${ayah.numberInSurah}`,
        edition,
        language,
        text: ayah.text,
      });
    }
  }
  return rows;
}

async function upsertRows(sql, rows) {
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await sql`
      INSERT INTO verse_translations ${sql(batch, "ref", "edition", "language", "text")}
      ON CONFLICT (ref, edition) DO UPDATE SET text = EXCLUDED.text
    `;
  }
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  console.log("Backfilling en.sahih from verses.translation…");
  const verseRows = await sql`SELECT ref, translation FROM verses`;
  if (verseRows.length !== EXPECTED_AYAH_COUNT) {
    throw new Error(
      `verses table holds ${verseRows.length} rows, expected ${EXPECTED_AYAH_COUNT} — run seed-quran.mjs first.`
    );
  }
  const enRows = verseRows.map((r) => ({
    ref: r.ref,
    edition: "en.sahih",
    language: "en",
    text: r.translation,
  }));
  await upsertRows(sql, enRows);
  console.log(`Backfilled ${enRows.length} en.sahih rows.`);

  for (const { edition, language } of EDITIONS) {
    console.log(`Fetching ${edition}…`);
    const surahs = await fetchEdition(edition);
    const rows = toRows(surahs, edition, language);
    if (rows.length !== EXPECTED_AYAH_COUNT) {
      throw new Error(
        `${edition} returned ${rows.length} ayahs, expected ${EXPECTED_AYAH_COUNT} — aborting without writing this edition.`
      );
    }
    await upsertRows(sql, rows);
    console.log(`Upserted ${rows.length} rows for ${edition}.`);
  }

  const [{ count }] = await sql`SELECT count(*)::int AS count FROM verse_translations`;
  console.log(`Done. verse_translations table now holds ${count} rows.`);
} finally {
  await sql.end();
}
