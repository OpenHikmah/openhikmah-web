import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/layout/LandingHeader";
import { MobileNavBar } from "@/components/layout/MobileNavBar";
import { STORIES, getVisibleStoryBySlug, resolveLocalized } from "@/lib/stories";
import { resolveVerse } from "@/lib/quran/verse-resolver";
import { getQuranEdition, getUiLocale } from "@/lib/i18n/request-prefs";
import { StoryVerseCard } from "./StoryVerseCard";
import { OpenOnCanvasButton } from "./OpenOnCanvasButton";
import { StoryActivityTracker } from "./StoryActivityTracker";
import type { Verse } from "@/types/quran";

interface Props {
  params: Promise<{ slug: string }>;
}

// Verse text varies on the oh_edition cookie, so this can't be a static
// pre-render despite generateStaticParams below — that still drives routing,
// but rendering happens per request.
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return STORIES.map((story) => ({ slug: story.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const story = await getVisibleStoryBySlug(slug);
  if (!story) return {};
  const locale = await getUiLocale();
  return {
    title: `${resolveLocalized(story.name, locale)} — Open Hikmah`,
    description: resolveLocalized(story.tagline, locale),
  };
}

export default async function StoryDetailPage({ params }: Props) {
  const { slug } = await params;
  const story = await getVisibleStoryBySlug(slug);
  if (!story) notFound();

  const locale = await getUiLocale();
  const t = await getTranslations("stories");
  const allRefs = story.chapters.flatMap((c) => c.verseRefs);
  const edition = await getQuranEdition();
  // Per-ref resolveVerse (corpus first, live alquran.cloud fallback) rather than
  // the batch getVerses — the corpus is seeded asynchronously and stories must
  // still render before it's fully populated.
  const resolved = await Promise.all(allRefs.map((ref) => resolveVerse(ref, edition)));
  const verseMap = new Map<string, Verse>(
    resolved.filter((v): v is Verse => v !== null).map((v) => [v.ref, v])
  );

  return (
    <div className="min-h-dvh bg-bg text-text-primary">
      <LandingHeader />
      <MobileNavBar />
      <StoryActivityTracker slug={slug} />

      {/* Story hero */}
      <div className="mx-auto max-w-3xl border-b border-border-subtle px-6 pb-12 pt-14 text-center">
        <Link
          href="/stories"
          className="mb-6 inline-flex items-center gap-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t("allStories")}</span>
        </Link>

        <h1 className="mb-3 font-arabic text-6xl text-gold">{story.arabicName}</h1>
        <p className="mb-2 text-xl text-text-primary">{resolveLocalized(story.name, locale)}</p>
        <p className="mb-6 text-sm text-text-secondary">
          {resolveLocalized(story.tagline, locale)}
        </p>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-text-secondary">
          {resolveLocalized(story.intro, locale)}
        </p>
      </div>

      {/* Chapter timeline */}
      <div className="mx-auto max-w-3xl space-y-14 px-6 py-12">
        {story.chapters.map((chapter) => {
          const verses = chapter.verseRefs
            .map((ref) => verseMap.get(ref))
            .filter((v): v is Verse => v !== undefined);
          const missingCount = chapter.verseRefs.length - verses.length;

          return (
            <section key={chapter.id}>
              <h2 className="mb-3 text-lg font-medium text-text-primary">
                {resolveLocalized(chapter.title, locale)}
              </h2>
              <p className="mb-6 text-sm leading-relaxed text-text-secondary">
                {resolveLocalized(chapter.narrative, locale)}
              </p>

              <div className="space-y-3">
                {verses.map((verse) => (
                  <StoryVerseCard key={verse.ref} verse={verse} />
                ))}
              </div>

              {missingCount > 0 && (
                <p className="mt-3 text-xs text-text-muted">
                  {t("missingVerses", { count: missingCount })}
                </p>
              )}

              {verses.length > 0 && (
                <div className="mt-5">
                  <OpenOnCanvasButton verses={verses} label={t("openOnCanvas")} />
                </div>
              )}
            </section>
          );
        })}
      </div>

      <footer className="border-t border-border-subtle pt-6 pb-[calc(72px+env(safe-area-inset-bottom))] text-center text-xs text-text-muted md:pb-6">
        {t("footer")}
      </footer>
    </div>
  );
}
