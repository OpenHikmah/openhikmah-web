/**
 * One-time seed of the local Quran corpus into the `verses` table.
 *
 * Pulls two whole-Quran editions from alquran.cloud (Arabic uthmani + Sahih
 * International translation), merges them by reference, and upserts. Idempotent:
 * safe to re-run. After this, the app serves verse text from Postgres instead of
 * fetching alquran.cloud / quran.com per request.
 *
 *   DATABASE_URL=... node scripts/seed-quran.mjs
 */
import postgres from "postgres";

const ARABIC_EDITION = "quran-uthmani";
const TRANSLATION_EDITION = "en.sahih";
const EXPECTED_AYAH_COUNT = 6236;

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

function indexByRef(surahs) {
  const map = new Map();
  for (const surah of surahs) {
    for (const ayah of surah.ayahs) {
      map.set(`${surah.number}:${ayah.numberInSurah}`, {
        surah: surah.number,
        ayah: ayah.numberInSurah,
        text: ayah.text,
      });
    }
  }
  return map;
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  console.log("Fetching Arabic + translation editions…");
  const [arabicSurahs, translationSurahs] = await Promise.all([
    fetchEdition(ARABIC_EDITION),
    fetchEdition(TRANSLATION_EDITION),
  ]);

  const arabic = indexByRef(arabicSurahs);
  const translation = indexByRef(translationSurahs);

  const rows = [];
  for (const [ref, ar] of arabic) {
    const tr = translation.get(ref);
    if (!tr) {
      console.warn(`No translation for ${ref}; skipping`);
      continue;
    }
    rows.push({
      ref,
      surah: ar.surah,
      ayah: ar.ayah,
      arabic_text: ar.text,
      translation: tr.text,
    });
  }

  console.log(`Merged ${rows.length} verses (expected ${EXPECTED_AYAH_COUNT}).`);
  if (rows.length !== EXPECTED_AYAH_COUNT) {
    console.warn(
      `WARNING: verse count ${rows.length} != ${EXPECTED_AYAH_COUNT}. Proceeding, but verify the source.`
    );
  }

  // Upsert in batches to keep statements reasonable.
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await sql`
      INSERT INTO verses ${sql(batch, "ref", "surah", "ayah", "arabic_text", "translation")}
      ON CONFLICT (ref) DO UPDATE SET
        arabic_text = EXCLUDED.arabic_text,
        translation = EXCLUDED.translation
    `;
    console.log(`Upserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }

  const [{ count }] = await sql`SELECT count(*)::int AS count FROM verses`;
  console.log(`Done. verses table now holds ${count} rows.`);
} finally {
  await sql.end();
}
