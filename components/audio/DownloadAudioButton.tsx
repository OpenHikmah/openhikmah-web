"use client";

import { useState } from "react";
import { Check, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { IconButton, Tooltip } from "@/components/ui";
import { usePreferencesStore } from "@/store/preferences";

export function DownloadAudioButton({ surah, ayah }: { surah: number; ayah: number }) {
  const t = useTranslations("common");
  const reciter = usePreferencesStore((s) => s.reciter);
  const [started, setStarted] = useState(false);

  // A plain same-origin link, not a blob: the route's Content-Disposition names
  // the file, so Chrome can't fall back to a blob UUID with no extension.
  const handleClick = () => {
    const a = document.createElement("a");
    a.href = `/api/audio/${surah}/${ayah}?reciter=${encodeURIComponent(reciter)}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStarted(true);
  };

  return (
    <>
      <Tooltip label={started ? t("downloadStarted") : t("downloadAudio")}>
        <IconButton
          onClick={handleClick}
          aria-label={`${t("downloadAudio")} ${surah}:${ayah}`}
          className={cn(started && "border-teal text-teal")}
        >
          {started ? <Check /> : <Download />}
        </IconButton>
      </Tooltip>
      <span role="status" className="sr-only">
        {started ? t("downloadStarted") : ""}
      </span>
    </>
  );
}
