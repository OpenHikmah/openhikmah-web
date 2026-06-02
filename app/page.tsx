import Link from "next/link";
import type { Metadata } from "next";
import { LandingHeader } from "@/components/layout/LandingHeader";
import { VerseOfDayStrip } from "@/components/today/VerseOfDayStrip";
import { buttonVariants } from "@/components/ui/Button";
import { getVerseOfDay } from "@/lib/verse-of-day";

export const metadata: Metadata = {
  title: "Open Hikmah — the Qur'an as a connected graph",
  description:
    "Search any verse and map its connections — shared roots, themes, and contrasts — grounded in canonical Qur'an data.",
};

// Themes → a representative verse, opened directly on the canvas.
const STARTERS: Array<{ label: string; ref: string }> = [
  { label: "Patience", ref: "2:153" },
  { label: "Mercy", ref: "1:3" },
  { label: "Light", ref: "24:35" },
  { label: "Gratitude", ref: "14:7" },
];

export default async function Home() {
  const verse = await getVerseOfDay().catch(() => null);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <LandingHeader />

      <main className="mx-auto flex w-full min-h-0 max-w-[1180px] flex-1 flex-col px-6 md:px-12">
        <div className="flex flex-1 flex-col justify-center">
          <h1 className="max-w-[16ch] text-[clamp(2.25rem,5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-text-primary">
            Explore the Qur&apos;an as a <span className="text-gold">connected graph</span>.
          </h1>
          <p className="mt-4 max-w-[52ch] text-[18px] leading-relaxed text-text-secondary">
            Search any verse and map its connections — shared roots, themes, and contrasts —
            grounded in canonical data, not guessed by AI.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/canvas" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Open the canvas
            </Link>
            <Link href="/names" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Browse the Asma&apos;ul Husna
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <span className="mr-1 text-[13px] text-text-muted">Begin with</span>
            {STARTERS.map((s) => (
              <Link
                key={s.ref}
                href={`/canvas?verse=${s.ref}`}
                className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-primary transition-[color,border-color] duration-[120ms] hover:border-gold-muted hover:text-gold"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>

        {verse && (
          <div className="shrink-0 pb-6">
            <VerseOfDayStrip verse={verse} />
          </div>
        )}
      </main>

      <footer className="shrink-0 border-t border-border px-6 py-4 md:px-12">
        <p className="text-[13px] text-text-muted">
          Open Hikmah · Qur&apos;an text &amp; translation from canonical sources.
        </p>
      </footer>
    </div>
  );
}
