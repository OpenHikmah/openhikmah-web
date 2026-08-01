import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai/ai";
import { getNameBySlug } from "@/lib/names/divine-names";
import { getOrGenerateNameContent } from "@/lib/names/name-content";
import { consume, RateLimitError } from "@/lib/infra/rate-limit";
import { clientKey } from "@/lib/infra/http";
import { getUiLocale } from "@/lib/i18n/request-prefs";
import { LOCALE_LANGUAGE_NAME, type Locale } from "@/lib/i18n/config";
import { TANZIH_CONSTRAINT } from "@/lib/ai/theological-constraints";

// Bump to force regeneration after a prompt change.
const REFLECTION_VERSION = 1;

function buildPrompt(
  arabic: string,
  transliteration: string,
  meaning: string,
  description: string,
  locale: Locale
): string {
  const languageLine =
    locale === "en"
      ? ""
      : `\n7. Write the reflection in ${LOCALE_LANGUAGE_NAME[locale]}, keeping rules 1–5 (especially Tanzih) unchanged.`;
  return `You are a classical Islamic scholar grounded in the Maturidi/Hanafi tradition (Ahl al-Sunnah wal-Jama'ah).

The divine name ${transliteration} (${arabic}) means "${meaning}".
Theological context: ${description}

Task: Write a "Believer's Reflection" — a single paragraph (3–5 sentences) describing the orthodox Maturidi/Hanafi framework for how a believer internalises and realises this divine name in their own life.

Critical rules:
1. NEVER equate the divine attribute directly to a human action or quality.
2. ALWAYS maintain ${TANZIH_CONSTRAINT}. The attribute belongs exclusively and infinitely to Allah.
3. Frame the reflection as the believer's RESPONSE to the name, not a possession of it.
4. Use the language of trust (tawakkul), striving (sa'y), and certainty (yaqin) as appropriate.
5. Keep the tone reverent, orthodox, and practically grounded.
6. Return ONLY the paragraph — no title, no labels, no JSON, just the reflection text.${languageLine}

Example for Al-Razzaq: "The believer's realisation of Al-Razzaq is not to claim any power over provision, but to strive with full effort in lawful means while maintaining absolute certainty in the heart that the outcome belongs solely to Allah. The servant plants, waters, and labours — yet knows that it is Allah who causes the grain to grow."`;
}

async function getReflection(
  slug: string,
  locale: Locale,
  onBeforeGenerate: () => Promise<void>
): Promise<string> {
  const name = getNameBySlug(slug);
  if (!name) return "";
  return getOrGenerateNameContent(
    slug,
    "reflection",
    locale,
    REFLECTION_VERSION,
    () =>
      callAI(
        buildPrompt(name.arabic, name.transliteration, name.meaning, name.description, locale)
      ),
    (s) => s.trim() === "",
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
    const reflection = await getReflection(slug, locale, async () => {
      if (!(await consume(`names-gen:${clientKey(req)}`))) throw new RateLimitError();
    });
    return NextResponse.json({ reflection });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
    }
    console.error("Reflection error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
