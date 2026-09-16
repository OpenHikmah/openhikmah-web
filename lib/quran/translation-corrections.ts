/**
 * Manually verified fixes for upstream alquran.cloud translation text copied
 * verbatim by scripts/seed-translations.mjs and verse-resolver.ts's live-fetch
 * fallback. Exact (ref, edition) matching only — never a heuristic applied to
 * unverified verses. See scripts/audit-translation-punctuation.mjs for
 * finding further candidates; each must be independently verified before an
 * entry is added here.
 */

interface TranslationCorrection {
  ref: string;
  edition: string;
  correctedText: string;
  source: string;
}

const CORRECTIONS: readonly TranslationCorrection[] = [
  {
    ref: "103:2",
    edition: "az.mammadaliyev",
    correctedText:
      "İnsan (ömrünü bihudə işlərə sərf etməklə, dünyanı axirətdən üstün tutmaqla) ziyan içindədir.",
    source:
      'api.alquran.cloud az.mammadaliyev ends this ayah with a stray "?" instead of "." — verified against an independent Azerbaijani Quran reference, 2026-08-02.',
  },
];

/** Returns the verified correction for (ref, edition) if one exists, else `text` unchanged. */
export function correctTranslation(ref: string, edition: string | undefined, text: string): string {
  if (!edition) return text;
  return CORRECTIONS.find((c) => c.ref === ref && c.edition === edition)?.correctedText ?? text;
}
