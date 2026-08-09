import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Verse } from "@/types/quran";

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: vi.fn((changes: unknown[], nodes: unknown[]) => nodes),
  applyEdgeChanges: vi.fn((changes: unknown[], edges: unknown[]) => edges),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { useCanvasStore } from "@/store/canvas";
import { OpenOnCanvasButton } from "@/app/stories/[slug]/OpenOnCanvasButton";

const VERSE_TEXT: Record<string, { arabicText: string; translation: string }> = {
  "12:4": {
    arabicText:
      "إِذْ قَالَ يُوسُفُ لِأَبِيهِ يَا أَبَتِ إِنِّي رَأَيْتُ أَحَدَ عَشَرَ كَوْكَبًا وَالشَّمْسَ وَالْقَمَرَ رَأَيْتُهُمْ لِي سَاجِدِينَ",
    translation:
      '[Of these stories mention] when Joseph said to his father, "O my father, indeed I have seen [in a dream] eleven stars and the sun and the moon; I saw them prostrating to me."',
  },
  "12:5": {
    arabicText:
      "قَالَ يَا بُنَيَّ لَا تَقْصُصْ رُؤْيَاكَ عَلَىٰ إِخْوَتِكَ فَيَكِيدُوا لَكَ كَيْدًا ۖ إِنَّ الشَّيْطَانَ لِلْإِنسَانِ عَدُوٌّ مُّبِينٌ",
    translation:
      'He said, "O my son, do not relate your vision to your brothers or they will contrive against you a plan. Indeed Satan, to man, is a manifest enemy.',
  },
  "12:6": {
    arabicText:
      "وَكَذَٰلِكَ يَجْتَبِيكَ رَبُّكَ وَيُعَلِّمُكَ مِن تَأْوِيلِ الْأَحَادِيثِ وَيُتِمُّ نِعْمَتَهُ عَلَيْكَ وَعَلَىٰ آلِ يَعْقُوبَ كَمَا أَتَمَّهَا عَلَىٰ أَبَوَيْكَ مِن قَبْلُ إِبْرَاهِيمَ وَإِسْحَاقَ ۚ إِنَّ رَبَّكَ عَلِيمٌ حَكِيمٌ",
    translation:
      'And thus will your Lord choose you and teach you the interpretation of narratives [i.e., events or dreams] and complete His favor upon you and upon the family of Jacob, as He completed it upon your fathers before, Abraham and Isaac. Indeed, your Lord is Knowing and Wise."',
  },
};

function verse(ref: string): Verse {
  const [s, a] = ref.split(":");
  const text = VERSE_TEXT[ref];
  return {
    surah: Number(s),
    ayah: Number(a),
    ref: ref as Verse["ref"],
    arabicText: text.arabicText,
    translation: text.translation,
    surahName: "Yusuf",
    surahNameArabic: "يوسف",
  };
}

describe("OpenOnCanvasButton", () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    mockPush.mockReset();
  });

  it("adds every verse to the canvas and navigates there", () => {
    const verses = [verse("12:4"), verse("12:5"), verse("12:6")];
    render(<OpenOnCanvasButton verses={verses} />);

    fireEvent.click(screen.getByRole("button", { name: /open on canvas/i }));

    expect(useCanvasStore.getState().nodes).toHaveLength(3);
    expect(mockPush).toHaveBeenCalledWith("/canvas");
  });

  it("does not add a duplicate node for a verse already on the canvas", () => {
    useCanvasStore.getState().addVerseNode(verse("12:4"), { x: 0, y: 0 });
    const verses = [verse("12:4"), verse("12:5")];
    render(<OpenOnCanvasButton verses={verses} />);

    fireEvent.click(screen.getByRole("button", { name: /open on canvas/i }));

    expect(useCanvasStore.getState().nodes).toHaveLength(2);
  });

  it("a second click adds no further nodes (idempotent)", () => {
    const verses = [verse("12:4"), verse("12:5")];
    render(<OpenOnCanvasButton verses={verses} />);

    const button = screen.getByRole("button", { name: /open on canvas/i });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(useCanvasStore.getState().nodes).toHaveLength(2);
  });

  it("re-enables the button after a grace period if navigation never unmounts it", () => {
    vi.useFakeTimers();
    try {
      const verses = [verse("12:4")];
      render(<OpenOnCanvasButton verses={verses} />);

      const button = screen.getByRole("button", { name: /open on canvas/i });
      fireEvent.click(button);
      expect(button).toBeDisabled();

      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(button).not.toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-enables the button immediately if adding a node throws", () => {
    const verses = [verse("12:4")];
    const addVerseNodeSpy = vi
      .spyOn(useCanvasStore.getState(), "addVerseNode")
      .mockImplementation(() => {
        throw new Error("store write failed");
      });
    render(<OpenOnCanvasButton verses={verses} />);

    const button = screen.getByRole("button", { name: /open on canvas/i });
    fireEvent.click(button);

    expect(button).not.toBeDisabled();
    expect(mockPush).not.toHaveBeenCalled();
    addVerseNodeSpy.mockRestore();
  });
});
