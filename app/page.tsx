import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingHeader } from "@/components/layout/LandingHeader";
import { MobileNavBar } from "@/components/layout/MobileNavBar";
import { HomeView } from "@/components/home/HomeView";
import { getVerseOfDay } from "@/lib/quran/verse-of-day";

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

  const verse = await getVerseOfDay().catch(() => null);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <LandingHeader />
      <MobileNavBar />

      <HomeView verse={verse} />
    </div>
  );
}
