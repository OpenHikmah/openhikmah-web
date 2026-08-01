import { screen, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithIntl as render } from "../../test-utils/render-with-intl";
import { useCanvasStore } from "@/store/canvas";
import type { Verse, VerseRef } from "@/types/quran";

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    ReactFlow: () => null,
    Background: () => null,
    BackgroundVariant: { Dots: "dots" },
    MiniMap: () => null,
    Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useReactFlow: () => ({ fitView: vi.fn() }),
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { HikmahCanvas } from "@/components/canvas/HikmahCanvas";

function verseNode(id: string, ref: string) {
  const verse: Verse = {
    surah: 1,
    ayah: 1,
    ref: ref as VerseRef,
    arabicText: "نص",
    translation: "text",
    surahName: "Al-Fatihah",
    surahNameArabic: "الفاتحة",
  };
  return { id, type: "verse", position: { x: 0, y: 0 }, data: verse };
}

describe("HikmahCanvas expand-during-expansion", () => {
  beforeEach(() => {
    useCanvasStore.setState({
      nodes: [verseNode("n1", "1:1"), verseNode("n2", "2:255")] as never,
      edges: [],
    });
  });

  it("surfaces a notice instead of silently dropping a second expand while one is in flight", async () => {
    // Never resolves within the test — simulates an in-flight AI generation.
    const pendingFetch = new Promise<never>(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pendingFetch)
    );

    render(<HikmahCanvas onSearchOpen={vi.fn()} />);

    act(() => {
      useCanvasStore.getState().setPendingExpand({ nodeId: "n1", ref: "1:1", kind: "thematic" });
    });

    // Second request arrives while the first is still in flight.
    act(() => {
      useCanvasStore.getState().setPendingExpand({ nodeId: "n2", ref: "2:255", kind: "thematic" });
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/already running/i);
    });

    vi.unstubAllGlobals();
  });
});
