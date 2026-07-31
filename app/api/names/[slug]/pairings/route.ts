import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai/ai";
import { getNameBySlug, DIVINE_NAMES } from "@/lib/names/divine-names";
import { getOrGenerateNameContent } from "@/lib/names/name-content";
import { consume, RateLimitError } from "@/lib/infra/rate-limit";
import { clientKey } from "@/lib/infra/http";
import { getUiLocale } from "@/lib/i18n/request-prefs";
import { LOCALE_LANGUAGE_NAME, type Locale } from "@/lib/i18n/config";

// Bump to force regeneration after a prompt change.
const PAIRINGS_VERSION = 1;

interface Pairing {
  name: string;
  transliteration: string;
  arabic: string;
  explanation: string;
}

function buildPrompt(
  transliteration: string,
  arabic: string,
  meaning: string,
  locale: Locale
): string {
  const languageLine =
    locale === "en"
      ? ""
      : `\nWrite each "explanation" in ${LOCALE_LANGUAGE_NAME[locale]}. Keep "transliteration" and "arabic" as-is (do not translate names). Keep the Tanzih constraint above unchanged.`;
  return `You are a classical Islamic scholar (Maturidi/Hanafi tradition).

The divine name ${transliteration} (${arabic}) means "${meaning}".

Task: Identify 2–3 other divine names from the 99 Names that most frequently appear paired with ${transliteration} in the Quran. For each, explain in ONE sentence why this pairing provides perfect theological balance in the specific contexts where they appear together.

Only include pairings where both names actually co-appear in the same verse or in closely related verses as documented in classical tafsir. Maintain strict Tanzih: never describe or imply physical form, spatial location, or resemblance to created things.${languageLine}

Return ONLY a JSON array:
[
  {
    "transliteration": "Ar-Rahim",
    "arabic": "الرَّحِيم",
    "explanation": "One sentence on why this pairing balances ${transliteration}."
  }
]`;
}

async function getPairings(
  slug: string,
  locale: Locale,
  onBeforeGenerate: () => Promise<void>
): Promise<Pairing[]> {
  const name = getNameBySlug(slug);
  if (!name) return [];

  return getOrGenerateNameContent(
    slug,
    "pairings",
    locale,
    PAIRINGS_VERSION,
    async () => {
      const text = await callAI(
        buildPrompt(name.transliteration, name.arabic, name.meaning, locale)
      );

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

      return items.slice(0, 3).map((p) => {
        const match = DIVINE_NAMES.find(
          (n) =>
            n.transliteration.toLowerCase() === p.transliteration.toLowerCase() ||
            n.arabic === p.arabic
        );
        return {
          name: match?.slug ?? "",
          transliteration: p.transliteration,
          arabic: p.arabic,
          explanation: p.explanation,
        };
      });
    },
    (v) => v.length === 0,
    onBeforeGenerate
  );
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
