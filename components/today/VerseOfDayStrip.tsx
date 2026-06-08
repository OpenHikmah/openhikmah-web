import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Verse } from "@/types/quran";

/**
 * The Verse of the Day as a tight, functional strip (Quiet Minimal direction):
 * a labelled meta column, the Arabic at a readable size, the translation, and a
 * single quiet action into the canvas. Not a centered showpiece.
 */
export function VerseOfDayStrip({ verse }: { verse: Verse }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-5 md:flex-row md:items-center md:gap-7 md:pt-7">
      {/* The whole meta block is the link to the full verse — with a persistent
          arrow + hover so it clearly reads as tappable (not a passive label). */}
      <Link href="/today" className="group min-w-[150px] shrink-0">
        <span className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted transition-colors group-hover:text-gold">
          Verse of the day
          <ArrowRight className="h-3 w-3 opacity-60 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100" />
        </span>
        <div className="mt-1.5 font-mono text-[13px] tracking-wide text-gold underline-offset-4 group-hover:underline">
          {verse.ref} · {verse.surahName}
        </div>
      </Link>

      {/* One-line teaser: clamp the Arabic and fade the (left/RTL) cut edge
          rather than appending a "…" glyph to the Qur'an text. min-w-0 lets the
          flex item shrink below its content width instead of blowing out the row;
          the full verse is one tap away at /today. */}
      <p
        dir="rtl"
        className="min-w-0 flex-1 overflow-hidden whitespace-nowrap font-arabic text-[22px] leading-[1.9] text-text-primary md:text-[28px]"
      >
        {verse.arabicText}
      </p>

      <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-text-secondary line-clamp-1 md:line-clamp-2">
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
