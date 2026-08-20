import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/layout/LandingHeader";
import { MobileNavBar } from "@/components/layout/MobileNavBar";
import { listVisibleStories, resolveLocalized } from "@/lib/stories";
import { getUiLocale } from "@/lib/i18n/request-prefs";

export const metadata = {
  title: "Prophetic Stories — Open Hikmah",
  description:
    "Curated stories of the Prophets mentioned in the Quran, with verified verse mappings and a direct path to the connection canvas.",
};

export default async function StoriesPage() {
  const locale = await getUiLocale();
  const t = await getTranslations("stories");
  const stories = await listVisibleStories();
  return (
    <div className="min-h-screen bg-bg pb-[calc(72px+env(safe-area-inset-bottom))] text-text-primary md:pb-0">
      <LandingHeader />
      <MobileNavBar />

      <main>
        <div className="px-6 pb-10 pt-12 text-center border-b border-border-subtle">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-text-muted">
            {t("eyebrow")}
          </p>
          <h1 className="mb-4 text-2xl font-light text-text-primary">{t("heading")}</h1>
          <p className="mx-auto max-w-xl text-sm text-text-secondary">{t("description")}</p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-4 px-6 py-12 sm:grid-cols-2 lg:grid-cols-3">
          {stories.map((story) => {
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
                  {t("chapterVerseCount", { chapters: story.chapters.length, verses: verseCount })}
                </p>
              </Link>
            );
          })}
        </div>
      </main>

      <footer className="border-t border-border-subtle py-6 text-center text-xs text-text-muted">
        {t("footer")}
      </footer>
    </div>
  );
}
