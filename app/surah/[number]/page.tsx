import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/layout/LandingHeader";
import { MobileNavBar } from "@/components/layout/MobileNavBar";
import { getSurahVerses } from "@/lib/quran/quran-corpus";
import { getSurahName } from "@/lib/quran/surah-names";
import { SURAH_LENGTHS } from "@/lib/quran/audio";
import { getQuranEdition } from "@/lib/i18n/request-prefs";
import { SurahReaderActions } from "./SurahReaderActions";
import { SurahReaderList } from "./SurahReaderList";
import type { MatchedSurah } from "@/types/quran";

interface Props {
  params: Promise<{ number: string }>;
}

// Verse text varies on the oh_edition cookie, so this can't be a static
// pre-render despite generateStaticParams below — that still drives routing,
// but rendering happens per request.
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return Array.from({ length: 114 }, (_, i) => ({ number: String(i + 1) }));
}

function parseSurahNumber(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = parseInt(raw, 10);
  return n >= 1 && n <= 114 ? n : null;
}

export async function generateMetadata({ params }: Props) {
  const { number } = await params;
  const surahNum = parseSurahNumber(number);
  if (!surahNum) return {};
  const [name] = getSurahName(surahNum);
  return { title: `${name} — Open Hikmah` };
}

export default async function SurahReaderPage({ params }: Props) {
  const { number } = await params;
  const surahNum = parseSurahNumber(number);
  if (!surahNum) notFound();

  const t = await getTranslations("search");
  const edition = await getQuranEdition();
  const [name, nameArabic] = getSurahName(surahNum);
  const ayahCount = SURAH_LENGTHS[surahNum - 1];
  const verses = await getSurahVerses(surahNum, edition);

  const surah: MatchedSurah = { number: surahNum, name, nameArabic, ayahCount };

  return (
    <div className="min-h-dvh bg-bg pb-mobile-nav text-text-primary md:pb-0">
      <LandingHeader />
      <MobileNavBar />

      <div className="mx-auto max-w-3xl border-b border-border-subtle px-6 pb-10 pt-14 text-center">
        <Link
          href="/search"
          className="mb-6 inline-flex items-center gap-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t("backToSearch")}</span>
        </Link>

        <h1 className="mb-2 font-arabic text-6xl text-gold">{nameArabic}</h1>
        <p className="mb-2 text-xl text-text-primary">{name}</p>
        <p className="mb-6 text-sm text-text-secondary">{t("ayahCount", { count: ayahCount })}</p>

        <SurahReaderActions surah={surah} />
      </div>

      <div className="mx-auto max-w-3xl px-6 py-10">
        <SurahReaderList verses={verses} />
      </div>
    </div>
  );
}
