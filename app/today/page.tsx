import type { Metadata } from "next";
import { LandingHeader } from "@/components/layout/LandingHeader";
import { NavBar } from "@/components/layout/NavBar";
import { VerseOfDayCard } from "@/components/today/VerseOfDayCard";
import { getVerseOfDay } from "@/lib/verse-of-day";

export const metadata: Metadata = {
  title: "Verse of the Day — Open Hikmah",
  description:
    "A daily verse from the Qur'an to reflect on — listen, bookmark, or open it on the connection canvas.",
};

// Render per request so the verse always matches the current UTC day. A fixed
// revalidate window wouldn't align with the midnight-UTC rollover and could
// serve yesterday's verse for up to that window; the day pick is cheap and the
// underlying verse fetch is cached upstream, so dynamic rendering is fine here.
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const verse = await getVerseOfDay().catch(() => null);

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <LandingHeader />
      <NavBar />

      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col items-center justify-center px-6 py-12 md:px-12">
        {verse ? (
          <VerseOfDayCard verse={verse} />
        ) : (
          <p className="text-sm text-text-muted">
            Couldn&apos;t load today&apos;s verse right now. Please try again later.
          </p>
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
