import Link from "next/link";
import { VerseOfDayStrip } from "@/components/today/VerseOfDayStrip";
import { CanvasPreview } from "./CanvasPreview";
import { buttonVariants } from "@/components/ui/Button";
import { JOURNEYS } from "@/lib/journeys";
import type { Verse } from "@/types/quran";

/**
 * The signed-out landing: an asymmetric hero (value statement + actions on the
 * left, a live-looking canvas recreation bleeding off the right) over the Verse
 * of the Day, composed to sit within one screen. Shown to first-time and
 * logged-out visitors and rendered server-side, so it is the SEO/first-paint
 * default.
 *
 * One-screen fit lives here, not on the shared page wrapper (which must stay
 * scrollable for the taller signed-in PersonalHome): the <main> takes the column's
 * flex space, the hero centres in it, the Verse of the Day pins to the bottom, and
 * overflow is clipped so the right-side bleed never adds a scrollbar.
 */
export function MarketingHero({ verse }: { verse: Verse | null }) {
  return (
    <main className="relative mx-auto flex w-full min-h-0 max-w-[1180px] flex-1 flex-col overflow-hidden px-6 md:px-12">
      <div className="grid flex-1 grid-cols-1 items-center gap-8 py-8 md:grid-cols-[1.02fr_0.98fr] md:gap-6">
        {/* Left — copy + actions */}
        <div className="relative z-10 max-md:order-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-text-muted">
            The Qur&apos;an, connected
          </p>
          <h1 className="mt-4 max-w-[15ch] text-[clamp(1.85rem,4.4vw,3.1rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-text-primary">
            Explore the Qur&apos;an as a <span className="text-gold">connected graph</span>.
          </h1>
          <p className="mt-4 max-w-[46ch] text-[16.5px] leading-relaxed text-text-secondary">
            Search any verse and map its connections — shared roots, themes, and contrasts —
            grounded in canonical data, not guessed by AI.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link href="/canvas" className={`${buttonVariants({ variant: "primary", size: "lg" })} w-full sm:w-auto`}>
              Open the canvas
            </Link>
            <Link
              href="/names"
              className="text-[14.5px] text-text-secondary underline-offset-4 transition-colors hover:text-gold hover:underline"
            >
              Browse the Asma&apos;ul Husna →
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <span className="mr-1 text-[13px] text-text-muted">Begin with</span>
            {JOURNEYS.map((j) => (
              <Link
                key={j.ref}
                href={`/canvas?verse=${j.ref}`}
                className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-primary transition-[color,border-color] duration-[120ms] hover:border-gold-muted hover:text-gold"
              >
                {j.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Right — borderless canvas recreation, bleeding off the edge */}
        <div className="relative min-h-[230px] self-stretch max-md:order-1 max-md:-mx-6 md:-mr-12 md:min-h-0">
          <CanvasPreview className="md:absolute md:inset-0 md:scale-[1.04]" />
        </div>
      </div>

      {verse && (
        <div className="shrink-0 pb-6">
          <VerseOfDayStrip verse={verse} />
        </div>
      )}
    </main>
  );
}
