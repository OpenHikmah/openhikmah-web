"use client";

import Link from "next/link";
import { Volume2, Pause, Network, BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, buttonVariants } from "@/components/ui";
import { useSurahListen } from "./useSurahListen";
import type { MatchedSurah } from "@/types/quran";

export function SurahResultCard({ surah }: { surah: MatchedSurah }) {
  const t = useTranslations("search");
  const { isThisPlaying, handleListen } = useSurahListen(surah);

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-text-muted">{t("fullSurah")}</p>
          <h2 className="mt-1 text-xl font-semibold text-text-primary">{surah.name}</h2>
          <p className="mt-1 font-arabic text-right text-2xl text-text-primary">
            {surah.nameArabic}
          </p>
          <p className="mt-2 text-sm text-text-muted">
            {t("ayahCount", { count: surah.ayahCount })}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleListen}
          className={buttonVariants({ variant: "primary", size: "sm" })}
        >
          {isThisPlaying ? <Pause className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          {isThisPlaying ? t("pauseListening") : t("listen")}
        </button>
        <Link
          href={`/canvas?surah=${surah.number}`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <Network className="h-3.5 w-3.5" />
          {t("readInCanvas")}
        </Link>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-text-muted">
        <BookOpen className="h-3 w-3" />
        {t("surahReadHint")}
      </p>
    </Card>
  );
}
