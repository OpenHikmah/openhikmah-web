import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai/ai";
import { getNameBySlug } from "@/lib/names/divine-names";
import { isValidRef } from "@/lib/quran/quran-corpus";
import { resolveVerse } from "@/lib/quran/verse-resolver";
import { getOrGenerateNameContent, getOrGenerateVerseReason } from "@/lib/names/name-content";
import { consume, RateLimitError } from "@/lib/infra/rate-limit";
import { clientKey } from "@/lib/infra/http";
import { incr } from "@/lib/infra/metrics";
import { getUiLocale, getQuranEdition } from "@/lib/i18n/request-prefs";
import { LOCALE_LANGUAGE_NAME, DEFAULT_EDITION_BY_LOCALE, type Locale } from "@/lib/i18n/config";
import { TANZIH_CONSTRAINT } from "@/lib/ai/theological-constraints";
import sanitizeHtml from "sanitize-html";
import type { VerseRef } from "@/types/quran";

// Bump to force regeneration after a prompt/search change.
const VERSES_VERSION = 2;

interface NameVerse {
  ref: VerseRef;
  surah: number;
  ayah: number;
  arabicText: string;
  translation: string;
  surahName: string;
  surahNameArabic: string;
  reason: string;
}

async function fetchVerseData(ref: string): Promise<Omit<NameVerse, "reason"> | null> {
  if (!isValidRef(ref)) return null;
  const verse = await resolveVerse(ref);
  if (!verse) {
    // resolveVerse already logs the underlying corpus/live-fetch failure —
    // this just keeps the metric so an upstream outage stays visible on
    // /api/metrics, not silent.
    incr("quran_api_fetch_error");
    return null;
  }
  return verse;
}

// Search quran.com for verses containing this name's Arabic text
async function searchVerseRefs(arabic: string): Promise<string[]> {
  try {
    const url = `https://api.quran.com/api/v4/search?q=${encodeURIComponent(arabic)}&size=8&language=en&page=1`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results = (data?.search?.results ?? []) as Array<{ verse_key?: string }>;
    return results
      .filter((r) => r.verse_key && /^\d+:\d+$/.test(r.verse_key))
      .map((r) => r.verse_key as string)
      .slice(0, 5);
  } catch (err) {
    // Same reasoning as fetchVerseData: a failed search must be distinguishable
    // from "genuinely no matching verses" in logs and /api/metrics.
    console.error(`Name verses: quran.com search failed for "${arabic}":`, err);
    incr("quran_search_api_error");
    return [];
  }
}

// Generate AI reasons for why each verse is connected to this name
async function buildReasons(
  refs: string[],
  transliteration: string,
  meaning: string
): Promise<Map<string, string>> {
  if (refs.length === 0) return new Map();
  const prompt = `You are a classical Islamic scholar (Maturidi/Hanafi tradition).

Divine name: ${transliteration} — "${meaning}"

For each verse reference below, write ONE concise sentence (max 20 words) explaining how this verse manifests or relates to this divine name.
Maintain ${TANZIH_CONSTRAINT}. Return ONLY a JSON object mapping ref → reason.

Refs: ${refs.join(", ")}

Output format:
{ "surah:ayah": "one sentence", ... }`;

  try {
    const text = await callAI(prompt);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return new Map();
    const obj: unknown = JSON.parse(match[0]);
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return new Map();
    return new Map(
      Object.entries(obj).filter((e): e is [string, string] => typeof e[1] === "string")
    );
  } catch (err) {
    // Reasons are best-effort (a default reason is used per verse if missing) —
    // log so a persistently malformed AI response is visible, not silent.
    console.error(`Name verses: failed to parse AI reasons for ${transliteration}:`, err);
    return new Map();
  }
}

// Fallback: AI-only verse finding (used when search returns no results)
async function fallbackAIVerses(
  arabic: string,
  transliteration: string,
  meaning: string,
  description: string
): Promise<Array<{ ref: string; reason: string }>> {
  const prompt = `You are a classical Islamic scholar (Maturidi/Hanafi tradition).

The divine name ${transliteration} (${arabic}) means "${meaning}".
Context: ${description}

Find exactly 5 Quran verse references where this name's Arabic root appears or the verse concludes with a form of this name.
Maintain ${TANZIH_CONSTRAINT}.
Return ONLY a JSON array:
[{ "ref": "surah:ayah", "reason": "one sentence" }, ...]`;

  try {
    const text = await callAI(prompt);
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const raw: unknown = JSON.parse(match[0]);
    // The model proposes refs from memory here — validate shape AND that each
    // ref is a real Quran reference before anything downstream touches it.
    return (Array.isArray(raw) ? raw : []).filter(
      (item): item is { ref: string; reason: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).ref === "string" &&
        isValidRef((item as Record<string, unknown>).ref as string) &&
        typeof (item as Record<string, unknown>).reason === "string"
    );
  } catch (err) {
    // Empty result is not cached (it retries), but log the parse failure so a
    // broken prompt surfaces instead of silently re-invoking the AI forever.
    console.error(`Name verses: AI fallback failed for ${transliteration}:`, err);
    return [];
  }
}

function stripHtml(text: string): string {
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
}

// Translates (not re-derives) a verse's canonical English `reason` into the
// target language, so the underlying theological justification stays exactly
// what was already generated and validated in English.
async function translateReason(reason: string, language: string): Promise<string> {
  const prompt = `Translate the following sentence into ${language}. Preserve its meaning exactly — do not add, remove, or alter any theological claim, and maintain ${TANZIH_CONSTRAINT}. Return ONLY the translated sentence, with no quotation marks, labels, or explanation.

Sentence: "${reason}"`;
  const translated = await callAI(prompt);
  return translated.trim();
}

async function getVersesBySlug(
  slug: string,
  locale: Locale,
  edition: string,
  onBeforeGenerate: () => Promise<void>
): Promise<NameVerse[]> {
  const name = getNameBySlug(slug);
  if (!name) return [];

  const verses = await getOrGenerateNameContent(
    slug,
    "verses",
    // Verse selection is always cached/generated as "en" regardless of the
    // requester's locale — see name_verse_reasons below for why.
    "en",
    VERSES_VERSION,
    async (): Promise<NameVerse[]> => {
      // Try actual quran.com search first
      const refs = await searchVerseRefs(name.arabic);

      // If search found results, fetch verse data + AI reasons
      if (refs.length > 0) {
        const [verseDataResults, reasonMap] = await Promise.all([
          Promise.all(refs.map((ref) => fetchVerseData(ref))),
          buildReasons(refs, name.transliteration, name.meaning),
        ]);

        const verses: NameVerse[] = refs
          .map((ref, i) => {
            const vd = verseDataResults[i];
            if (!vd) return null;
            return {
              ...vd,
              translation: stripHtml(vd.translation),
              reason: reasonMap.get(ref) ?? `Contains a form of ${name.transliteration}.`,
            } as NameVerse;
          })
          .filter((v): v is NameVerse => v !== null);

        if (verses.length > 0) return verses;
      }

      // Fallback: pure AI verse selection
      const aiItems = await fallbackAIVerses(
        name.arabic,
        name.transliteration,
        name.meaning,
        name.description
      );
      if (aiItems.length === 0) return [];

      const verseDataResults = await Promise.all(
        aiItems.slice(0, 5).map((item) => fetchVerseData(item.ref))
      );
      return aiItems
        .slice(0, 5)
        .map((item, i) => {
          const vd = verseDataResults[i];
          if (!vd) return null;
          return { ...vd, reason: item.reason } as NameVerse;
        })
        .filter((v): v is NameVerse => v !== null);
    },
    (v) => v.length === 0,
    onBeforeGenerate
  );

  if (verses.length === 0) return verses;

  // The cache above is keyed to "en" regardless of locale — verse *selection*
  // (and its arabicText/translation as generated) never varies by request, so
  // it isn't re-fetched per locale. But the displayed translation must still
  // honor the requester's edition, so re-hydrate it here when it differs from
  // the canonical en.sahih the cache was built with. arabicText is left as-is
  // — resolveVerse always sources it from ar.alafasy regardless of `edition`,
  // so re-fetching it would be a same-value round trip.
  const hydratedVerses =
    edition === DEFAULT_EDITION_BY_LOCALE.en
      ? verses
      : await Promise.all(
          verses.map(async (v) => {
            const localized = await resolveVerse(v.ref, edition);
            if (!localized) {
              // Same reasoning as fetchVerseData: falling back to the cached
              // en.sahih text (rather than failing the whole names/verses
              // response over one edition) must still be visible, not silent.
              console.error(`Name verses: edition hydration failed for ${v.ref}/${edition}`);
              incr("quran_api_fetch_error");
              return v;
            }
            return {
              ...v,
              translation: stripHtml(localized.translation),
            };
          })
        );

  if (locale === "en") return hydratedVerses;

  // Localize only the per-verse reason text (a translation of the canonical
  // English reason, cached in name_verse_reasons) — the verse list itself
  // stays exactly as selected above, so it never differs by locale.
  //
  // The translation batch below shares ONE rate-limit charge, not one per
  // verse — without this guard, Promise.all would call onBeforeGenerate once
  // per uncached verse (up to 5), burning a non-English client's budget
  // several times faster than an English client's for the same page load. A
  // request can still consume up to 2 total (this shared charge plus the
  // canonical-selection charge above), matching "one charge per distinct
  // generation effort" — selecting verses and translating reasons are two
  // separate AI-generation events, same as reflection/pairings each charging
  // once for their one event.
  let rateLimitChecked = false;
  const onBeforeGenerateOnce = async () => {
    if (rateLimitChecked) return;
    rateLimitChecked = true;
    await onBeforeGenerate();
  };

  const language = LOCALE_LANGUAGE_NAME[locale];
  const localizedReasons = await Promise.all(
    hydratedVerses.map(async (v) => {
      const translated = await getOrGenerateVerseReason(
        slug,
        v.ref,
        locale,
        () => translateReason(v.reason, language),
        onBeforeGenerateOnce
      );
      // A blank/failed translation must never silently replace an
      // already-generated, already-Tanzih-checked English reason — fall back
      // to it and log, rather than serve empty text.
      if (translated.trim() === "") {
        console.error(`Name verses: empty translation for ${slug}/${v.ref}/${locale}`);
        return v.reason;
      }
      return translated;
    })
  );
  return hydratedVerses.map((v, i) => ({ ...v, reason: localizedReasons[i] }));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const name = getNameBySlug(slug);
  if (!name) {
    return NextResponse.json({ error: "Name not found" }, { status: 404 });
  }

  try {
    const locale = await getUiLocale();
    const edition = await getQuranEdition();
    const verses = await getVersesBySlug(slug, locale, edition, async () => {
      if (!(await consume(`names-gen:${clientKey(req)}`))) throw new RateLimitError();
    });
    return NextResponse.json(verses);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
    }
    console.error("Name verses error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
