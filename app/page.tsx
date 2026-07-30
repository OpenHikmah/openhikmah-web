import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingHeader } from "@/components/layout/LandingHeader";
import { MobileNavBar } from "@/components/layout/MobileNavBar";
import { WaveBackground } from "@/components/home/WaveBackground";
import { HomeView } from "@/components/home/HomeView";
import { getVerseOfDay } from "@/lib/quran/verse-of-day";
import { getQuranEdition } from "@/lib/i18n/request-prefs";

export const metadata: Metadata = {
  title: "Open Hikmah — the Qur'an as a connected graph",
  description:
    "Search any verse and map its connections — shared roots, themes, and contrasts — grounded in canonical Qur'an data.",
};

// Render per request so the Verse of the Day matches the current UTC day — and
// the same verse /today (also force-dynamic) links through to. getVerse is a plain
// DB read (no dynamic API), so otherwise this page would prerender at build and
// freeze the verse, diverging from /today.
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ share?: string }>;
}) {
  // Back-compat: old share links were "/?share=<id>". Shares now live on the
  // canvas, where they're restored — forward them there.
  const { share } = await searchParams;
  if (share) redirect(`/canvas?share=${encodeURIComponent(share)}`);

  const edition = await getQuranEdition();
  const verse = await getVerseOfDay(undefined, edition).catch((err) => {
    console.error("Home: Verse of the Day load failed:", err);
    return null;
  });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <WaveBackground />
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <LandingHeader />
        <MobileNavBar />

        <HomeView verse={verse} />
      </div>
    </div>
  );
}
