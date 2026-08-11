import { screen, fireEvent } from "@testing-library/react";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/canvas",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { Header } from "@/components/layout/Header";
import { useCanvasStore } from "@/store/canvas";
import * as canvasExport from "@/lib/canvas/canvas-export";
import type { Verse } from "@/types/quran";

const baseVerse: Verse = {
  surah: 2,
  ayah: 255,
  ref: "2:255",
  arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ",
  translation: "Allah — there is no deity except Him.",
  surahName: "Al-Baqarah",
  surahNameArabic: "البقرة",
};

beforeEach(() => {
  useCanvasStore.getState().reset();
  useCanvasStore.getState().addVerseNode(baseVerse, { x: 0, y: 0 });
});

describe("Header mobile bar — export-failed vs. clear icon", () => {
  it("uses a distinct icon for the export-failed indicator, not the same one as Clear", async () => {
    vi.spyOn(canvasExport, "exportCanvasToPng").mockRejectedValue(new Error("export failed"));

    renderWithIntl(<Header onSearchOpen={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "Export as PNG" }));

    const failedButton = await screen.findByRole("button", { name: "Failed" });
    const clearButton = screen.getByRole("button", { name: "Clear" });

    const failedIconSvg = failedButton.querySelector("svg")?.innerHTML;
    const clearIconSvg = clearButton.querySelector("svg")?.innerHTML;

    expect(failedIconSvg).toBeTruthy();
    expect(clearIconSvg).toBeTruthy();
    expect(failedIconSvg).not.toBe(clearIconSvg);
  });
});
