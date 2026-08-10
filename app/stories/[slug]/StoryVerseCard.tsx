"use client";

import { Pause, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, IconButton, Tooltip } from "@/components/ui";
import { useAudioStore } from "@/store/audio";
import { cn } from "@/lib/utils";
import type { Verse } from "@/types/quran";

export function StoryVerseCard({ verse }: { verse: Verse }) {
  const t = useTranslations("stories");
  const playVerse = useAudioStore((s) => s.playVerse);
  const pauseAudio = useAudioStore((s) => s.pause);
  const resumeAudio = useAudioStore((s) => s.resume);
  const currentRef = useAudioStore((s) => s.currentRef);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const isThisCurrent = currentRef === verse.ref;
  const isThisPlaying = isThisCurrent && isPlaying;

  const handleListen = () => {
    if (isThisPlaying) pauseAudio();
    else if (isThisCurrent) resumeAudio();
    else
      playVerse({
        ref: verse.ref,
        surah: verse.surah,
        ayah: verse.ayah,
        surahName: verse.surahName,
      });
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded border border-gold bg-gold/10 px-1.5 py-0.5 font-mono text-xs text-gold">
          {verse.ref}
        </span>
        <Tooltip label={isThisPlaying ? t("pauseRecitation") : t("listen")}>
          <IconButton
            tone="teal"
            onClick={handleListen}
            aria-label={isThisPlaying ? t("pauseRecitation") : t("listenToRecitation")}
            className={cn(isThisCurrent && "border-teal text-teal")}
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
}
