import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { wordMorphology } from "@/lib/infra/db/schema";
import { isValidRef } from "@/lib/quran/quran-corpus";

/**
 * Per-word morphology (root + lemma) for a verse, from the seeded
 * `word_morphology` table. Powers word-level interactivity in the sidebar. Pure
 * DB read — no AI. Returns `{ words: [] }` (200) when the verse isn't seeded, so
 * the UI degrades to plain text uniformly.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ surah: string; ayah: string }> }
) {
  const { surah, ayah } = await params;
  const ref = `${parseInt(surah, 10)}:${parseInt(ayah, 10)}`;

  if (!isValidRef(ref)) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  try {
    const words = await db
      .select({
        position: wordMorphology.position,
        surface: wordMorphology.surface,
        root: wordMorphology.root,
        lemma: wordMorphology.lemma,
      })
      .from(wordMorphology)
      .where(eq(wordMorphology.ref, ref))
      .orderBy(asc(wordMorphology.position));

    return NextResponse.json({ words });
  } catch (err) {
    console.error("Morphology route error:", err);
    return NextResponse.json({ words: [] }, { status: 200 });
  }
}
