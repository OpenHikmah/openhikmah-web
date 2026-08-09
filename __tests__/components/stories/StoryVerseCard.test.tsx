import type { ReactElement } from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { useAudioStore } from "@/store/audio";
import { StoryVerseCard } from "@/app/stories/[slug]/StoryVerseCard";
import { TooltipProvider } from "@/components/ui";
import type { Verse } from "@/types/quran";

const VERSE: Verse = {
  surah: 12,
  ayah: 4,
  ref: "12:4" as Verse["ref"],
  arabicText:
    "إِذْ قَالَ يُوسُفُ لِأَبِيهِ يَا أَبَتِ إِنِّي رَأَيْتُ أَحَدَ عَشَرَ كَوْكَبًا وَالشَّمْسَ وَالْقَمَرَ رَأَيْتُهُمْ لِي سَاجِدِينَ",
  translation:
    '[Of these stories mention] when Joseph said to his father, "O my father, indeed I have seen [in a dream] eleven stars and the sun and the moon; I saw them prostrating to me."',
  surahName: "Yusuf",
  surahNameArabic: "يوسف",
};

function renderWithTr(ui: ReactElement) {
  return renderWithIntl(<TooltipProvider>{ui}</TooltipProvider>, "tr");
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
