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
 * resumable: an already-translated (slug, field, locale) is skipped outright
 * (checked first, via getCachedNameContent) rather than re-translated, so
 * it's cheap and safe to re-run, and a re-run doesn't pay DELAY_MS for rows
 * it isn't actually generating.
 *
 *   ANTHROPIC_API_KEY=... DATABASE_URL=... bun scripts/backfill-name-meta.ts
 */
import { DIVINE_NAMES } from "@/lib/names/divine-names";
import { getCachedNameContent } from "@/lib/names/name-content";
import { getLocalizedNameField, META_VERSION, type NameMetaField } from "@/lib/names/name-meta";
import type { Locale } from "@/lib/i18n/config";

const TARGET_LOCALES = ["tr", "ru", "az"] as const satisfies readonly Locale[];

const DELAY_MS = Number(process.env.BACKFILL_DELAY_MS ?? 1500);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let translated = 0;
let fellBack = 0;
let skipped = 0;
let errored = 0;

for (const locale of TARGET_LOCALES) {
  for (const name of DIVINE_NAMES) {
    const fields: Array<[NameMetaField, string]> = [
      ["meaning", name.meaning],
      ["description", name.description],
    ];
    for (const [field, canonical] of fields) {
      const cached = await getCachedNameContent<string>(name.slug, field, locale, META_VERSION);
      if (cached != null) {
        skipped++;
        continue; // already translated — no AI call, so no delay either
      }

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

console.error(
  `Done. translated=${translated} fellBack=${fellBack} skipped=${skipped} errored=${errored}`
);
// A fallen-back translation degrades gracefully (English shown, not cached as
// a substitute) so it's an expected outcome, not a run failure — but any
// error deserves a non-zero exit so automation notices a genuinely broken run.
process.exit(errored > 0 ? 1 : 0);
