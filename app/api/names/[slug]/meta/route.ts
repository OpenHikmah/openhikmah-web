import { NextRequest, NextResponse } from "next/server";
import { getNameBySlug } from "@/lib/names/divine-names";
import { getLocalizedNameField, META_VERSION } from "@/lib/names/name-meta";
import { consume, RateLimitError } from "@/lib/infra/rate-limit";
import { clientKey } from "@/lib/infra/http";
import { getUiLocale } from "@/lib/i18n/request-prefs";

export { META_VERSION };

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const name = getNameBySlug(slug);
  if (!name) {
    return NextResponse.json({ error: "Name not found" }, { status: 404 });
  }

  try {
    const locale = await getUiLocale();

    // One shared rate-limit charge for both fields, not one per field —
    // mirrors the verses route's shared per-request translation charge.
    let rateLimitChecked = false;
    const onBeforeGenerateOnce = async () => {
      if (rateLimitChecked) return;
      rateLimitChecked = true;
      if (!(await consume(`names-gen:${clientKey(req)}`))) throw new RateLimitError();
    };

    const [meaning, description] = await Promise.all([
      getLocalizedNameField(slug, "meaning", name.meaning, locale, onBeforeGenerateOnce),
      getLocalizedNameField(slug, "description", name.description, locale, onBeforeGenerateOnce),
    ]);
    return NextResponse.json({ meaning, description });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
    }
    console.error("Name meta error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
