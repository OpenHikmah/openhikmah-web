import { screen, fireEvent, act } from "@testing-library/react";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/canvas",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { Header } from "@/components/layout/Header";
import { useCanvasStore } from "@/store/canvas";
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

describe("Header mobile More sheet — keyboard accessibility", () => {
  it("moves focus into the sheet when it opens", async () => {
    renderWithIntl(<Header onSearchOpen={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "More" }));

    const pngButton = await screen.findByRole("button", { name: "Export as PNG" });
    expect(document.activeElement).toBe(pngButton);
  });

  it("traps Tab within the sheet, wrapping from the last control back to the first instead of leaking to the bar behind it", async () => {
    renderWithIntl(<Header onSearchOpen={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "More" }));

    const pngButton = await screen.findByRole("button", { name: "Export as PNG" });
    const pdfButton = screen.getByRole("button", { name: "Export as PDF" });

    await act(async () => {
      pdfButton.focus();
    });
    fireEvent.keyDown(pdfButton, { key: "Tab" });
    expect(document.activeElement).toBe(pngButton);

    fireEvent.keyDown(pngButton, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(pdfButton);
  });

  it("closes on Escape and returns focus to the More trigger", async () => {
    renderWithIntl(<Header onSearchOpen={() => {}} />);

    const trigger = screen.getByRole("button", { name: "More" });
    await act(async () => {
      trigger.focus();
    });
    fireEvent.click(trigger);
    await screen.findByRole("button", { name: "Export as PNG" });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("button", { name: "Export as PNG" })).not.toBeInTheDocument();
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});
