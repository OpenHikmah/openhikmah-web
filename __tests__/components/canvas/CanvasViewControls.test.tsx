import { screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Node } from "@xyflow/react";
import { renderWithIntl as render } from "../../test-utils/render-with-intl";
import { TooltipProvider } from "@/components/ui";
import { useCanvasStore } from "@/store/canvas";
import { usePreferencesStore } from "@/store/preferences";
import type { Verse } from "@/types/quran";

const fitView = vi.fn();
vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  useReactFlow: () => ({ fitView, zoomIn: vi.fn(), zoomOut: vi.fn() }),
}));

import { CanvasViewControls } from "@/components/canvas/CanvasViewControls";

// en.sahih (Saheeh International, alquran.cloud).
const V45: Verse = {
  surah: 2,
  ayah: 45,
  ref: "2:45",
  arabicText:
    "وَٱسْتَعِينُوا۟ بِٱلصَّبْرِ وَٱلصَّلَوٰةِ ۚ وَإِنَّهَا لَكَبِيرَةٌ إِلَّا عَلَى ٱلْخَٰشِعِينَ",
  translation:
    "And seek help through patience and prayer, and indeed, it is difficult except for the humbly submissive [to Allah]",
  surahName: "Al-Baqarah",
  surahNameArabic: "البقرة",
};

function renderControls() {
  return render(
    <TooltipProvider>
      <CanvasViewControls />
    </TooltipProvider>
  );
}

describe("CanvasViewControls", () => {
  beforeEach(() => {
    usePreferencesStore.getState().setCanvasPrefs({ showArabic: true });
  });

  afterEach(() => {
    cleanup();
    usePreferencesStore.getState().setCanvasPrefs({ showArabic: true });
  });

  it("turns Arabic on cards off and on from the View menu", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    const toggle = screen.getByRole("switch", { name: /Arabic on cards/ });

    fireEvent.click(toggle);
    expect(usePreferencesStore.getState().canvasPrefs.showArabic).toBe(false);
    fireEvent.click(toggle);
    expect(usePreferencesStore.getState().canvasPrefs.showArabic).toBe(true);
  });

  it("puts cards moved by hand back with Reset layout", () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: "a",
          type: "verse",
          position: { x: 900, y: 900 },
          data: { ...V45, pinned: true } as never,
        } as Node,
      ],
      edges: [],
    });
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    fireEvent.click(screen.getByRole("button", { name: /Reset layout/ }));
    expect((useCanvasStore.getState().nodes[0].data as unknown as Verse).pinned).toBe(false);
  });

  it("fits every verse into view", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Fit all verses" }));
    expect(fitView).toHaveBeenCalled();
  });
});
