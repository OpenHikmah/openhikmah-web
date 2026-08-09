import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, it, expect, beforeEach } from "vitest";
import tr from "@/messages/tr.json";
import { useAudioStore } from "@/store/audio";
import { StoryVerseCard } from "@/app/stories/[slug]/StoryVerseCard";
import { TooltipProvider } from "@/components/ui";
import type { Verse } from "@/types/quran";

const VERSE: Verse = {
  surah: 12,
  ayah: 4,
  ref: "12:4" as Verse["ref"],
  arabicText: "نص",
  translation: "text",
  surahName: "Yusuf",
  surahNameArabic: "يوسف",
};

function renderWithTr(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="tr" messages={tr}>
      <TooltipProvider>{ui}</TooltipProvider>
    </NextIntlClientProvider>
  );
}

describe("StoryVerseCard localization", () => {
  beforeEach(() => {
    useAudioStore.setState({ currentRef: null, isPlaying: false });
  });

  it("renders the Turkish 'Listen' label and aria-label, not hardcoded English", () => {
    renderWithTr(<StoryVerseCard verse={VERSE} />);
    expect(screen.getByRole("button", { name: "Kıraati dinle" })).toBeInTheDocument();
    expect(screen.queryByText("Listen to recitation")).not.toBeInTheDocument();
  });

  it("renders the Turkish 'Pause recitation' label while this verse is playing", () => {
    useAudioStore.setState({ currentRef: VERSE.ref, isPlaying: true });
    renderWithTr(<StoryVerseCard verse={VERSE} />);
    expect(screen.getByRole("button", { name: "Kıraati duraklat" })).toBeInTheDocument();
  });
});
