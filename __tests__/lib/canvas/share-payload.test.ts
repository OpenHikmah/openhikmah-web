import { describe, it, expect } from "vitest";
import { toSharePayload } from "@/lib/canvas/share-payload";
import type { SavedCanvas } from "@/store/canvas";

const verse = {
  surah: 2,
  ayah: 255,
  ref: "2:255" as const,
  arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ",
  translation: "Allah - there is no deity except Him, the Ever-Living, the Sustainer of existence.",
  surahName: "Al-Baqarah",
  surahNameArabic: "البقرة",
};

describe("toSharePayload", () => {
  it("keeps only structure: ids, positions, refs, root flag and edge kinds", () => {
    const canvas: SavedCanvas = {
      v: 1,
      nodes: [
        { id: "node-1", x: 1, y: 2, verse: { ...verse, isRoot: true, isLoading: false } },
        { id: "node-2", x: 3, y: 4, verse: { ...verse, ref: "112:1", surah: 112, ayah: 1 } },
      ],
      edges: [
        {
          id: "edge-1",
          source: "node-1",
          target: "node-2",
          kind: "root",
          label: "label",
          reason: "reason",
        },
      ],
    };
    expect(toSharePayload(canvas)).toEqual({
      v: 2,
      nodes: [
        { id: "node-1", x: 1, y: 2, ref: "2:255", isRoot: true },
        { id: "node-2", x: 3, y: 4, ref: "112:1" },
      ],
      edges: [{ id: "edge-1", source: "node-1", target: "node-2", kind: "root" }],
    });
  });
});
