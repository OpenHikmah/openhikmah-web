"use client";

import Link from "next/link";
import { Volume2, Pause } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui";
import { useSurahListen } from "@/components/search/useSurahListen";
import type { MatchedSurah } from "@/types/quran";

/** Sticky Listen control for the full surah, plus a low-emphasis escape
 *  hatch to the graph view for anyone who still wants it — reuses the exact
 *  same hook/queue-identity logic the search results' Listen button uses. */
export function SurahReaderActions({ surah }: { surah: MatchedSurah }) {
  const t = useTranslations("search");
  const { isThisPlaying, handleListen } = useSurahListen(surah);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleListen}
        className={buttonVariants({ variant: "primary", size: "md" })}
      >
        {isThisPlaying ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        {isThisPlaying ? t("pauseListening") : t("listen")}
      </button>
      <Link
        href={`/canvas?surah=${surah.number}`}
        className="text-xs text-text-muted underline-offset-2 transition-colors hover:text-text-secondary hover:underline"
      >
        {t("openInCanvasInstead")}
      </Link>
    </div>
  );
}
