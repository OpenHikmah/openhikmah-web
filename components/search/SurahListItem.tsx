"use client";

import Link from "next/link";
import { Volume2, Pause, Network } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, IconButton, Tooltip } from "@/components/ui";
import { useSurahListen } from "./useSurahListen";
import type { MatchedSurah } from "@/types/quran";

export function SurahListItem({ surah }: { surah: MatchedSurah }) {
  const t = useTranslations("search");
  const { isThisPlaying, handleListen } = useSurahListen(surah);

  return (
    <Card className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text-primary">{surah.name}</p>
        <p className="truncate text-xs text-text-muted">
          <span className="font-arabic">{surah.nameArabic}</span>
          {" · "}
          {t("ayahCount", { count: surah.ayahCount })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Tooltip label={isThisPlaying ? t("pauseListening") : t("listen")}>
          <IconButton
            tone="teal"
            size="sm"
            onClick={handleListen}
            aria-label={isThisPlaying ? t("pauseListening") : t("listen")}
          >
            {isThisPlaying ? <Pause /> : <Volume2 />}
          </IconButton>
        </Tooltip>
        <Tooltip label={t("readInCanvas")}>
          <Link
            href={`/canvas?surah=${surah.number}`}
            aria-label={t("readInCanvas")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-primary transition-colors hover:border-gold-muted hover:bg-white/5"
          >
            <Network className="h-3.5 w-3.5" />
          </Link>
        </Tooltip>
      </div>
    </Card>
  );
}
