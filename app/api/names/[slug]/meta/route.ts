import { NextRequest, NextResponse } from "next/server";
import { getNameBySlug } from "@/lib/names/divine-names";
import { getLocalizedNameField } from "@/lib/names/name-meta";
import { consume, RateLimitError } from "@/lib/infra/rate-limit";
import { clientKey } from "@/lib/infra/http";
import { getUiLocale } from "@/lib/i18n/request-prefs";

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
    // Memoizing the in-flight PROMISE (not a boolean set before the await)
    // matters: both fields call this concurrently, so a boolean flag set
    // synchronously before `consume()` resolves would let the second field
    // race past a charge that's about to come back rejected.
    let charge: Promise<void> | undefined;
    const onBeforeGenerateOnce = () =>
      (charge ??= consume(`names-gen:${clientKey(req)}`).then((allowed) => {
        if (!allowed) throw new RateLimitError();
      }));

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
