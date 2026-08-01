import Link from "next/link";
import { LandingHeader } from "@/components/layout/LandingHeader";
import { MobileNavBar } from "@/components/layout/MobileNavBar";
import { STORIES, resolveLocalized } from "@/lib/stories";
import { getUiLocale } from "@/lib/i18n/request-prefs";

export const metadata = {
  title: "Prophetic Stories — Open Hikmah",
  description:
    "Curated stories of the Prophets mentioned in the Quran, with verified verse mappings and a direct path to the connection canvas.",
};

export default async function StoriesPage() {
  const locale = await getUiLocale();
  return (
    <div className="min-h-screen bg-bg pb-[calc(72px+env(safe-area-inset-bottom))] text-text-primary md:pb-0">
      <LandingHeader />
      <MobileNavBar />

      <div className="px-6 pb-10 pt-12 text-center border-b border-border-subtle">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-text-muted">
          Prophetic Stories
        </p>
        <h1 className="mb-4 text-2xl font-light text-text-primary">
          The stories of the Prophets, verse by verse
        </h1>
        <p className="mx-auto max-w-xl text-sm text-text-secondary">
          Curated narratives grounded in verified Quran references — every verse resolved live, in
          your chosen translation. Open any chapter directly onto the connection canvas.
        </p>
      </div>

      <div className="mx-auto grid max-w-5xl gap-4 px-6 py-12 sm:grid-cols-2 lg:grid-cols-3">
        {STORIES.map((story) => {
          const verseCount = story.chapters.reduce((n, c) => n + c.verseRefs.length, 0);
          return (
            <Link
              key={story.slug}
              href={`/stories/${story.slug}`}
              className="group rounded-lg border border-border bg-surface p-5 transition-all duration-200 hover:scale-[1.01] hover:border-gold"
            >
              <div className="mb-2 font-arabic text-3xl text-gold">{story.arabicName}</div>
              <h2 className="text-lg font-medium text-text-primary">
                {resolveLocalized(story.name, locale)}
              </h2>
              <p className="mt-1.5 text-sm text-text-secondary">
                {resolveLocalized(story.tagline, locale)}
              </p>
              <p className="mt-3 text-xs text-text-muted">
                {story.chapters.length} chapter{story.chapters.length === 1 ? "" : "s"} ·{" "}
                {verseCount} verse{verseCount === 1 ? "" : "s"}
              </p>
            </Link>
          );
        })}
      </div>

      <footer className="border-t border-border-subtle py-6 text-center text-xs text-text-muted">
        Curated per the Maturidi/Hanafi tradition · every verse reference verified against the Quran
        corpus
      </footer>
    </div>
  );
}
