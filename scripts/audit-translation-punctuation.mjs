/**
 * Reports every ayah in a given alquran.cloud edition whose translation text
 * ends in "?" — candidates for manual review (see the trailing-"?" defect
 * fixed for 103:2/az.mammadaliyev in lib/quran/translation-corrections.ts).
 * Report-only: does not touch the DB, does not judge which candidates are
 * genuinely wrong (that requires human/scholarly review), never auto-fixes.
 *
 *   node scripts/audit-translation-punctuation.mjs [edition]
 *   node scripts/audit-translation-punctuation.mjs az.mammadaliyev
 */
const edition = process.argv[2] ?? "az.mammadaliyev";

const res = await fetch(`https://api.alquran.cloud/v1/quran/${edition}`);
if (!res.ok) {
  console.error(`Failed to fetch edition ${edition}: ${res.status}`);
  process.exit(1);
}
const json = await res.json();
const surahs = json?.data?.surahs;
if (!surahs) {
  console.error(`Malformed response for edition ${edition}`);
  process.exit(1);
}

const candidates = [];
for (const surah of surahs) {
  for (const ayah of surah.ayahs) {
    if (ayah.text.trim().endsWith("?")) {
      candidates.push({ ref: `${surah.number}:${ayah.numberInSurah}`, text: ayah.text });
    }
  }
}

console.log(`Edition: ${edition}`);
console.log(`Ayahs ending in "?": ${candidates.length}`);
for (const c of candidates) {
  console.log(`${c.ref}: ${c.text}`);
}
console.log(
  "\nThese are candidates only — review each manually against an independent reference " +
    "before adding an entry to lib/quran/translation-corrections.ts."
);
