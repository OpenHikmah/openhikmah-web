import Link from "next/link";
import type { Verse } from "@/types/quran";

/**
 * The Verse of the Day as a tight, functional strip (Quiet Minimal direction):
 * a labelled meta column, the Arabic at a readable size, the translation, and a
 * single quiet action into the canvas. Not a centered showpiece.
 */
export function VerseOfDayStrip({ verse }: { verse: Verse }) {
  return (
    <div className="flex flex-col gap-5 border-t border-border pt-7 md:flex-row md:items-center md:gap-7">
      <div className="min-w-[150px] shrink-0">
        <Link
          href="/today"
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted transition-colors hover:text-gold"
        >
          Verse of the day
        </Link>
        <div className="mt-1.5 font-mono text-[13px] tracking-wide text-gold">
          {verse.ref} · {verse.surahName}
        </div>
      </div>

      <p
        dir="rtl"
        className="font-arabic shrink-0 text-[28px] leading-[1.9] text-text-primary"
      >
        {verse.arabicText}
      </p>

      <p className="flex-1 text-[15px] leading-relaxed text-text-secondary">
        {verse.translation}
      </p>

      <Link
        href={`/canvas?verse=${verse.ref}`}
        className="shrink-0 whitespace-nowrap text-[13.5px] text-teal transition-colors hover:brightness-110"
      >
        Open on canvas →
      </Link>
    </div>
  );
}
