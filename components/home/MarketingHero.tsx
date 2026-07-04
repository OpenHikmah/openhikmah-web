import Link from "next/link";
import { VerseOfDayStrip } from "@/components/today/VerseOfDayStrip";
import { CanvasPreview } from "./CanvasPreview";
import { buttonVariants } from "@/components/ui/Button";
import type { Verse } from "@/types/quran";

/**
 * The signed-out landing: an asymmetric hero (value statement + actions on the
 * left, a live-looking canvas recreation bleeding off the right) over the Verse
 * of the Day, composed to sit within one screen. Shown to first-time and
 * logged-out visitors and rendered server-side, so it is the SEO/first-paint
 * default.
 *
 * One-screen fit lives here, not on the shared page wrapper. At md+ the <main>
 * takes the column's flex space, the hero centres in it, the Verse of the Day pins
 * to the bottom, and overflow is clipped so the right-side bleed never adds a
 * scrollbar. On mobile there isn't room for graph + copy + CTA in one screen, so
 * the <main> scrolls (like the signed-in PersonalHome): copy and the primary CTA
 * come first, the graph follows as a bounded block, and the trailing padding keeps
 * the last row clear of the fixed bottom NavBar.
 */
export function MarketingHero({ verse }: { verse: Verse | null }) {
  return (
    <main className="relative mx-auto flex w-full min-h-0 max-w-[1180px] flex-1 flex-col overflow-y-auto px-6 md:overflow-hidden md:px-12">
      <div className="grid flex-1 grid-cols-1 items-center gap-10 py-[clamp(0.75rem,3vh,2rem)] md:grid-cols-[1.02fr_0.98fr] md:gap-6">
        {/* Left — copy + actions (first, so it's always above the fold) */}
        <div className="relative z-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-text-muted">
            Every verse, in context
          </p>
          <h1 className="mt-4 max-w-[15ch] text-balance text-[clamp(1.85rem,4.4vw,3.1rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-text-primary">
            Explore the Qur&apos;an as a <span className="text-gold">connected graph</span>.
          </h1>
          <p className="mt-4 max-w-[46ch] text-[16.5px] leading-relaxed text-text-secondary">
            Search any verse and map its connections — shared roots, themes, and contrasts.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/canvas"
              className={`${buttonVariants({ variant: "primary", size: "lg" })} w-full sm:w-auto`}
            >
              Start exploring
            </Link>
          </div>
        </div>

        {/* Right — borderless canvas recreation. Cards stay fully on-screen
            (readable, never clipped); only the ambient backdrop feathers out. A
            bounded height on mobile keeps it a self-contained block below the copy. */}
        <div className="relative h-[clamp(300px,45vh,450px)] self-stretch md:h-auto md:min-h-[clamp(280px,50vh,450px)]">
          <CanvasPreview className="md:absolute md:inset-0" />
        </div>
      </div>

      {verse && (
        <div className="shrink-0 pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-6">
          <VerseOfDayStrip verse={verse} />
        </div>
      )}
    </main>
  );
}
