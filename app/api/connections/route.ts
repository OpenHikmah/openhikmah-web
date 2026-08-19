import { NextRequest, NextResponse } from "next/server";
import { getConnections } from "@/lib/ai/graph-service";
import { isValidRef } from "@/lib/quran/quran-corpus";
import { RateLimitError } from "@/lib/infra/rate-limit";
import { clientKey } from "@/lib/infra/http";
import { getUiLocale } from "@/lib/i18n/request-prefs";
import type { EdgeKind } from "@/types/quran";

const MAX_EXCLUDE_REFS = 100;
// A single verse's Arabic text and translation are at most a few hundred
// characters even for the longest ayahs — this is a generous but bounded cap
// to close the unbounded-prompt-into-AI-call gap without risking false
// rejections on legitimate verses.
const MAX_TEXT_LENGTH = 5000;

export async function POST(req: NextRequest) {
  let body: {
    fromRef?: string;
    kind?: string;
    arabicText?: string;
    translation?: string;
    excludeRefs?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { fromRef, kind, arabicText, translation, excludeRefs: rawExcludeRefs } = body;

  if (!fromRef || !kind || !arabicText || !translation) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!["thematic", "root", "contrast"].includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  if (!isValidRef(fromRef)) {
    return NextResponse.json({ error: "Invalid fromRef" }, { status: 400 });
  }

  if (arabicText.length > MAX_TEXT_LENGTH || translation.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: "arabicText/translation too long" }, { status: 400 });
  }

  let excludeRefs: string[] = [];
  if (rawExcludeRefs !== undefined) {
    if (
      !Array.isArray(rawExcludeRefs) ||
      rawExcludeRefs.length > MAX_EXCLUDE_REFS ||
      !rawExcludeRefs.every((r) => typeof r === "string" && isValidRef(r))
    ) {
      return NextResponse.json({ error: "Invalid excludeRefs" }, { status: 400 });
    }
    excludeRefs = rawExcludeRefs;
  }

  try {
    const locale = await getUiLocale();
    const results = await getConnections(
      fromRef,
      kind as EdgeKind,
      { arabicText, translation },
      { clientKey: clientKey(req), excludeRefs, locale }
    );

    // Empty results are not a server error, whether this is a "get more" request
    // running out of fresh connections, or a genuine first-time miss where the
    // grounding data isn't seeded for this verse yet and the AI proposed nothing
    // that survived validation. Either way the client already distinguishes the
    // two cases (see HikmahCanvas.tsx's runExpansion) and shows an appropriate
    // notice — the route itself has nothing to treat as an error here.
    return NextResponse.json(results);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
    }
    console.error("Connections route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
