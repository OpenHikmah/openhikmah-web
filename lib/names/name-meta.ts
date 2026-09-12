import { translateReason } from "@/lib/ai/translate";
import { getOrGenerateNameContent, type GenerationContext } from "@/lib/names/name-content";
import { LOCALE_LANGUAGE_NAME, type Locale } from "@/lib/i18n/config";
import { incr } from "@/lib/infra/metrics";

// Bump to force regeneration after a prompt change (see translateReason).
export const META_VERSION = 1;

export type NameMetaField = "meaning" | "description";

/**
 * Returns the localized text for a divine name's `meaning` or `description`
 * (lib/names/divine-names/types.ts), translating — never re-deriving — the
 * canonical English string on first request per `(slug, field, locale)` and
 * caching it durably in `name_content`. Same shape as
 * `getOrGenerateVerseReason`'s per-verse-reason translation, just keyed by
 * field instead of verse ref.
 *
 * `locale === "en"` short-circuits to `canonical` with no DB or AI round
 * trip, so the English path stays byte-identical to before this existed.
 *
 * Shared by the `/api/names/[slug]/meta` route (per-request, rate-limited via
 * `onBeforeGenerate`) and `scripts/backfill-name-meta.ts` (offline, no rate
 * limit) — both must translate through this one path so a prompt change only
 * needs to bump `META_VERSION` once.
 */
export async function getLocalizedNameField(
  slug: string,
  field: NameMetaField,
  canonical: string,
  locale: Locale,
  onBeforeGenerate?: () => Promise<void>
): Promise<string> {
  if (locale === "en") return canonical;

  const language = LOCALE_LANGUAGE_NAME[locale];
  const translated = await getOrGenerateNameContent<string>(
    slug,
    field,
    locale,
    META_VERSION,
    (ctx: GenerationContext) =>
      translateReason(
        canonical,
        language,
        { feature: "names", provider: ctx.provider, model: ctx.model },
        (reason) => {
          // A refusal must not be silently backed by Gemini either — same
          // rationale as the verses route's per-verse reason translation.
          if (reason === "refusal") ctx.markRefusal();
        }
      ).catch((err) => {
        console.error(`Name meta: translation call failed for ${slug}/${field}/${locale}:`, err);
        incr("names_ai_call_error");
        return "";
      }),
    (s) => s.trim() === "",
    onBeforeGenerate
  );

  // A blank/failed translation must never silently replace an already-vetted
  // canonical string — fall back to it (and log) rather than serve/cache
  // empty text. Not persisted as a substitute, so the next request retries.
  if (translated.trim() === "") {
    console.error(`Name meta: empty translation for ${slug}/${field}/${locale}`);
    return canonical;
  }
  return translated;
}
