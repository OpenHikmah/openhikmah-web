import { NextRequest, NextResponse } from "next/server";
import type { Verse } from "@/types/quran";
import { getSurahName } from "@/lib/surah-names";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ surah: string; ayah: string }> }
) {
  const { surah, ayah } = await params;
  const surahNum = parseInt(surah, 10);
  const ayahNum = parseInt(ayah, 10);

  if (!surahNum || !ayahNum || surahNum < 1 || surahNum > 114 || ayahNum < 1) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  try {
    const [arabicRes, translationRes] = await Promise.all([
      fetch(
        `https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/ar.alafasy`,
        { next: { revalidate: 86400 } }
      ),
      fetch(
        `https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/en.sahih`,
        { next: { revalidate: 86400 } }
      ),
    ]);

    if (!arabicRes.ok || !translationRes.ok) {
      return NextResponse.json({ error: "Verse not found" }, { status: 404 });
    }

    const [arabicData, translationData] = await Promise.all([
      arabicRes.json(),
      translationRes.json(),
    ]);

    const [surahName, surahNameArabic] = getSurahName(surahNum);

    const verse: Verse = {
      surah: surahNum,
      ayah: ayahNum,
      ref: `${surahNum}:${ayahNum}`,
      arabicText: arabicData.data.text,
      translation: translationData.data.text,
      surahName,
      surahNameArabic,
    };

    return NextResponse.json(verse);
  } catch {
    return NextResponse.json({ error: "Failed to fetch verse" }, { status: 500 });
  }
}
