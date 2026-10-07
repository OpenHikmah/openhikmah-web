import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai/ai";
import { looksLikeRefusal } from "@/lib/ai/refusal";
import { getNameBySlug, DIVINE_NAMES } from "@/lib/names/divine-names";
import { getOrGenerateNameContent, hashNameSource } from "@/lib/names/name-content";
import { verifyPairings } from "@/lib/names/name-verify";
import { consume, RateLimitError } from "@/lib/infra/rate-limit";
import { clientKey } from "@/lib/infra/http";
import { getUiLocale } from "@/lib/i18n/request-prefs";
import { LOCALE_LANGUAGE_NAME, type Locale } from "@/lib/i18n/config";
import { TANZIH_CONSTRAINT, containsTashbih } from "@/lib/ai/theological-constraints";
import { translateReason } from "@/lib/ai/translate";
import { incr } from "@/lib/infra/metrics";

// Bump to force regeneration after a prompt change. Exported so page.tsx can
// use the same version when checking the cache for a server-side prefetch.
export const PAIRINGS_VERSION = 2;

interface Pairing {
  name: string;
  transliteration: string;
  arabic: string;
  explanation: string;
}

function buildPrompt(transliteration: string, arabic: string, meaning: string): string {
  return `You are a classical Islamic scholar (Maturidi/Hanafi tradition).

The divine name ${transliteration} (${arabic}) means "${meaning}".

Task: Identify 2–3 other divine names from the 99 Names that most frequently appear paired with ${transliteration} in the Quran. For each, explain in ONE sentence why this pairing provides perfect theological balance in the specific contexts where they appear together.

Only include pairings where both names actually co-appear in the same verse or in closely related verses as documented in classical tafsir. Maintain ${TANZIH_CONSTRAINT}.

Return ONLY a JSON array:
[
  {
    "transliteration": "Ar-Rahim",
    "arabic": "الرَّحِيم",
    "explanation": "One sentence on why this pairing balances ${transliteration}."
  }
]`;
}

const isEmpty = (v: Pairing[]) => v.length === 0;

/**
 * Always generated in English, so the English-only containsTashbih() scan sees
 * every explanation before it is cached (issue #649). A non-English locale gets
 * translations of those already-scanned explanations, never explanations
 * written directly in the target language.
 */
async function getPairings(
  slug: string,
  locale: Locale,
  onBeforeGenerate: () => Promise<void>
): Promise<Pairing[]> {
  const name = getNameBySlug(slug);
  if (!name) return [];

  // Generating the English source and translating it serve one request, so a
  // cold non-English load charges the rate limit once, not twice.
  let charged = false;
  const onBeforeGenerateOnce = async () => {
    if (charged) return;
    charged = true;
    await onBeforeGenerate();
  };

  const english = await getOrGenerateNameContent(
    slug,
    "pairings",
    "en",
    PAIRINGS_VERSION,
    async (ctx) => {
      let text: string;
      try {
        text = await callAI(buildPrompt(name.transliteration, name.arabic, name.meaning), {
          feature: "names",
          provider: ctx.provider,
          model: ctx.model,
        });
      } catch (err) {
        // Not cached (empty result), so the next request retries — mirrors how
        // buildReasons/fallbackAIVerses in verses/route.ts tolerate a provider
        // failure instead of 500ing the whole page section.
        console.error(`Pairings: AI call failed for ${slug}:`, err);
        incr("names_ai_call_error");
        return [];
      }

      if (looksLikeRefusal(text)) {
        // A soft refusal is not canonical content — treat it like an empty
        // result (not cached, retried), same as the no-JSON-array case below.
        // markRefusal() also stops resolveAndGenerate from silently backing
        // this with Gemini.
        console.error(`Pairings: model returned a refusal for ${slug}, not caching`);
        incr("names_ai_refusal");
        ctx.markRefusal();
        return [];
      }

      let raw: unknown;
      try {
        const match = text.match(/\[[\s\S]*\]/);
        if (!match) {
          console.error(`Pairings: no JSON array in AI response for ${slug}`);
          return [];
        }
        raw = JSON.parse(match[0]);
      } catch (err) {
        // Malformed AI JSON returns empty (not cached, so it retries) — but log it
        // so a persistently broken response is visible instead of a silent cost sink.
        console.error(`Pairings: failed to parse AI response for ${slug}:`, err);
        return [];
      }

      // Parsing successfully does not mean the shape is right — a valid-JSON
      // response with the wrong structure must degrade to empty, not throw a 500
      // at the property accesses below.
      const items = (Array.isArray(raw) ? raw : []).filter(
        (p): p is { transliteration: string; arabic: string; explanation: string } =>
          typeof p === "object" &&
          p !== null &&
          typeof (p as Record<string, unknown>).transliteration === "string" &&
          typeof (p as Record<string, unknown>).arabic === "string" &&
          typeof (p as Record<string, unknown>).explanation === "string"
      );
      if (items.length === 0) {
        console.error(`Pairings: AI response for ${slug} had no validly-shaped entries`);
        return [];
      }

      const candidates = items
        .slice(0, 3)
        .map((p): Pairing | null => {
          if (containsTashbih(p.explanation)) {
            console.error(`Pairings: dropping Tashbih-phrased explanation for ${slug}`);
            incr("names_rejected_tashbih");
            return null;
          }
          const match = DIVINE_NAMES.find(
            (n) =>
              n.transliteration.toLowerCase() === p.transliteration.toLowerCase() ||
              n.arabic === p.arabic
          );
          if (!match) {
            // The admin editor's isValidPairings rejects a pairing whose name
            // doesn't resolve to one of the 99 — hold generation to the same
            // bar. A pairing we can't link isn't cacheable canonical content.
            console.error(
              `Pairings: dropping unresolved pairing "${p.transliteration}" for ${slug}`
            );
            return null;
          }
          return {
            name: match.slug,
            transliteration: p.transliteration,
            arabic: p.arabic,
            explanation: p.explanation,
          };
        })
        .filter((p): p is Pairing => p !== null);
      // Second-pass review before these are cached for every user: only
      // explicitly approved pairings survive, and any failure is empty, so
      // not cached and retried.
      return verifyPairings(name, candidates, ctx);
    },
    isEmpty,
    onBeforeGenerateOnce
  );
  if (locale === "en" || isEmpty(english)) return english;

  const language = LOCALE_LANGUAGE_NAME[locale];
  const translated = await getOrGenerateNameContent(
    slug,
    "pairings",
    locale,
    PAIRINGS_VERSION,
    async (ctx) => {
      const explanations = await Promise.all(
        english.map((p) =>
          translateReason(
            p.explanation,
            language,
            { feature: "names", provider: ctx.provider, model: ctx.model },
            (reason) => {
              if (reason === "refusal") ctx.markRefusal();
            }
          ).catch((err) => {
            console.error(`Pairings: translation call failed for ${slug}/${locale}:`, err);
            incr("names_ai_call_error");
            return "";
          })
        )
      );
      // All-or-nothing: caching a set where some explanations stayed English
      // would pin a half-translated entry for this locale until the next bump.
      if (explanations.some((e) => e.trim() === "")) return [];
      return english.map((p, i) => ({ ...p, explanation: explanations[i] }));
    },
    isEmpty,
    onBeforeGenerateOnce,
    hashNameSource(english.map((p) => p.explanation))
  );
  // Same as verses/route.ts: a failed translation (uncached, so retried on the
  // next request) falls back to the already-scanned English, never to blank.
  if (isEmpty(translated)) {
    console.error(`Pairings: incomplete translation for ${slug}/${locale}, serving English`);
    return english;
  }
  return translated;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const name = getNameBySlug(slug);
  if (!name) {
    return NextResponse.json({ error: "Name not found" }, { status: 404 });
  }

  try {
    const locale = await getUiLocale();
    const pairings = await getPairings(slug, locale, async () => {
      if (!(await consume(`names-gen:${clientKey(req)}`))) throw new RateLimitError();
    });
    return NextResponse.json(pairings);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
    }
    console.error("Pairings error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
