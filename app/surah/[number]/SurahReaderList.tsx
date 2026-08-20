"use client";

import { useEffect, useRef } from "react";
import { Pause, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, IconButton, Tooltip } from "@/components/ui";
import { useAudioStore } from "@/store/audio";
import { cn } from "@/lib/utils";
import type { Verse } from "@/types/quran";

export function SurahReaderList({ verses }: { verses: Verse[] }) {
  const t = useTranslations("stories");
  const currentRef = useAudioStore((s) => s.currentRef);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const playVerse = useAudioStore((s) => s.playVerse);
  const pause = useAudioStore((s) => s.pause);
  const resume = useAudioStore((s) => s.resume);

  const activeCardRef = useRef<HTMLDivElement | null>(null);

  // Scrolls the currently-playing ayah into view as the full-surah queue
  // advances, so listening reads as a guided, hands-free experience instead
  // of a static wall of 100+ verse cards the reader has to hunt through.
  useEffect(() => {
    if (currentRef && activeCardRef.current) {
      activeCardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentRef]);

  return (
    <div className="space-y-3">
      {verses.map((verse) => {
        const isActive = currentRef === verse.ref;
        const isThisPlaying = isActive && isPlaying;

        return (
          <Card
            key={verse.ref}
            ref={isActive ? activeCardRef : undefined}
            className={cn(
              "space-y-3 p-4 transition-colors",
              isActive && "border-teal bg-teal/[0.06]"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="rounded border border-gold bg-gold/10 px-1.5 py-0.5 font-mono text-xs text-gold">
                {verse.ref}
              </span>
              <Tooltip label={isThisPlaying ? t("pauseRecitation") : t("listen")}>
                <IconButton
                  tone="teal"
                  onClick={() => {
                    if (isThisPlaying) pause();
                    else if (isActive) resume();
                    else
                      playVerse({
                        ref: verse.ref,
                        surah: verse.surah,
                        ayah: verse.ayah,
                        surahName: verse.surahName,
                      });
                  }}
                  aria-label={isThisPlaying ? t("pauseRecitation") : t("listenToRecitation")}
                  className={cn(isActive && "border-teal text-teal")}
                >
                  {isThisPlaying ? <Pause /> : <Volume2 />}
                </IconButton>
              </Tooltip>
            </div>

            <p dir="rtl" className="font-arabic text-right text-xl leading-[2] text-text-primary">
              {verse.arabicText}
            </p>

            <p className="text-sm leading-relaxed text-text-secondary">{verse.translation}</p>
          </Card>
        );
      })}
    </div>
  );
}
