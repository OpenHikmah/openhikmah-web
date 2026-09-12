/**
 * Pre-translates every divine name's `meaning` and `description` into each
 * non-English locale, so /names and /names/[slug] show translated text from
 * the start instead of slowly warming via individual page visits (the /names
 * grid never triggers AI generation itself — see getCachedNameContentBulk in
 * lib/names/name-content.ts).
 *
 * Calls the same in-process path the /api/names/[slug]/meta route uses
 * (getLocalizedNameField), so a result lands in the exact same durable
 * name_content cache a real request would populate — idempotent and
 * resumable: an already-translated (slug, field, locale) is a cheap cache
 * hit, not a re-translation, so it's safe to re-run.
 *
 *   ANTHROPIC_API_KEY=... DATABASE_URL=... bun scripts/backfill-name-meta.ts
 */
import { DIVINE_NAMES } from "@/lib/names/divine-names";
import { getLocalizedNameField, type NameMetaField } from "@/lib/names/name-meta";
import { LOCALES, type Locale } from "@/lib/i18n/config";

const DELAY_MS = Number(process.env.BACKFILL_DELAY_MS ?? 1500);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const targetLocales = LOCALES.filter((l): l is Locale => l !== "en");

let translated = 0;
let fellBack = 0;
let errored = 0;

for (const locale of targetLocales) {
  for (const name of DIVINE_NAMES) {
    const fields: Array<[NameMetaField, string]> = [
      ["meaning", name.meaning],
      ["description", name.description],
    ];
    for (const [field, canonical] of fields) {
      try {
        const text = await getLocalizedNameField(name.slug, field, canonical, locale);
        if (text === canonical) {
          console.error(`  ✗ ${locale}/${name.slug}/${field} → empty translation, kept English`);
          fellBack++;
        } else {
          console.error(`  ✓ ${locale}/${name.slug}/${field}`);
          translated++;
        }
      } catch (err) {
        errored++;
        console.error(`  ✗ ${locale}/${name.slug}/${field} →`, err);
      }
      await sleep(DELAY_MS);
    }
  }
}

console.error(`Done. translated=${translated} fellBack=${fellBack} errored=${errored}`);
process.exit(errored > 0 && translated === 0 ? 1 : 0);
