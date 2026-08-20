import { screen, act, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
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
    useReactFlow: () => ({ fitView: vi.fn(), setCenter: vi.fn(), getZoom: vi.fn() }),
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { HikmahCanvas } from "@/components/canvas/HikmahCanvas";

const ARABIC_BY_REF: Record<string, string> = {
  "1:1": "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  "2:255": "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ",
};

function verseNode(id: string, ref: string) {
  const [s, a] = ref.split(":");
  const verse: Verse = {
    surah: Number(s),
    ayah: Number(a),
    ref: ref as VerseRef,
    arabicText: ARABIC_BY_REF[ref] ?? ARABIC_BY_REF["1:1"],
    translation: "text",
    surahName: "Al-Fatihah",
    surahNameArabic: "الفاتحة",
  };
  return { id, type: "verse", position: { x: 0, y: 0 }, data: verse };
}

function connection(ref: string) {
  return {
    surah: 2,
    ayah: 255,
    ref,
    arabicText: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ",
    translation: "text",
    surahName: "Al-Baqarah",
    surahNameArabic: "البقرة",
    reason: "reason",
    kind: "thematic",
  };
}

describe("HikmahCanvas entrance stagger", () => {
  beforeEach(() => {
    useCanvasStore.setState({
      nodes: [verseNode("n1", "1:1")] as never,
      edges: [],
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("adds each connection at a uniform ~350ms gap instead of a cumulative one", async () => {
    const connections = [connection("2:255"), connection("2:256"), connection("2:257")];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(connections),
      })
    );

    render(<HikmahCanvas onSearchOpen={vi.fn()} />);

    act(() => {
      useCanvasStore.getState().setPendingExpand({ nodeId: "n1", ref: "1:1", kind: "thematic" });
    });
    // Let the pendingExpand effect fire and the fetch microtask resolve.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(useCanvasStore.getState().nodes).toHaveLength(1); // just the source node so far

    await act(async () => {
      await vi.advanceTimersByTimeAsync(349);
    });
    expect(useCanvasStore.getState().nodes).toHaveLength(1); // not yet at 350ms

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(useCanvasStore.getState().nodes).toHaveLength(2); // first connection lands at 350ms

    await act(async () => {
      await vi.advanceTimersByTimeAsync(349);
    });
    expect(useCanvasStore.getState().nodes).toHaveLength(2); // not yet at the next 350ms gap

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(useCanvasStore.getState().nodes).toHaveLength(3); // second connection lands exactly 350ms later, not 700ms
  });
});

describe("HikmahCanvas expansion-notice timeout", () => {
  beforeEach(() => {
    useCanvasStore.setState({
      nodes: [verseNode("n1", "1:1")] as never,
      edges: [],
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("clears the pending notice-dismiss timeout on unmount instead of firing after unmount", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    const { unmount } = render(<HikmahCanvas onSearchOpen={vi.fn()} />);

    act(() => {
      useCanvasStore.getState().setPendingExpand({ nodeId: "n1", ref: "1:1", kind: "thematic" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // The failure path should have scheduled the 6s auto-dismiss.
    expect(screen.getByRole("status")).toBeInTheDocument();

    unmount();

    // Unmounting must clear the scheduled dismiss rather than letting it fire later.
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("surfaces a notice instead of silently dropping a connection when a different-kind edge already links the pair", async () => {
    useCanvasStore.setState({
      nodes: [verseNode("n1", "1:1"), verseNode("n2", "2:255")] as never,
      edges: [
        {
          id: "edge-existing",
          source: "n1",
          target: "n2",
          type: "hikmah",
          data: { kind: "thematic", label: "existing" },
        },
      ] as never,
    });
    // The AI identifies a "root" connection to a verse already on the canvas,
    // already linked to the source by a "thematic" edge — a different kind.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ ...connection("2:255"), kind: "root" }]),
      })
    );

    render(<HikmahCanvas onSearchOpen={vi.fn()} />);

    act(() => {
      useCanvasStore.getState().setPendingExpand({ nodeId: "n1", ref: "1:1", kind: "root" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "These verses are already connected a different way."
    );
    // The pre-existing thematic edge is untouched — no second edge was added.
    expect(useCanvasStore.getState().edges).toHaveLength(1);
    expect((useCanvasStore.getState().edges[0].data as { kind?: string })?.kind).toBe("thematic");
  });
});
