import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingHeader } from "@/components/layout/LandingHeader";
import { NavBar } from "@/components/layout/NavBar";
import { HomeView } from "@/components/home/HomeView";
import { getVerseOfDay } from "@/lib/verse-of-day";

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
      <NavBar />

      <HomeView verse={verse} />

      <footer className="shrink-0 border-t border-border px-6 py-4 md:px-12">
        <p className="text-[13px] text-text-muted">
          Open Hikmah · Qur&apos;an text &amp; translation from canonical sources.
        </p>
      </footer>
    </div>
  );
}
