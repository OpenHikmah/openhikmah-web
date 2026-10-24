import { act, cleanup, screen, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderWithIntl as render } from "../../test-utils/render-with-intl";
import { useCanvasStore } from "@/store/canvas";
import { NODE_WIDTH, COLUMN_GAP } from "@/lib/canvas/canvas-layout";
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

function verseNode(id: string, ref: string, position = { x: 0, y: 0 }) {
  const verse: Verse = {
    surah: 1,
    ayah: 1,
    ref: ref as VerseRef,
    arabicText: "نص",
    translation: "text",
    surahName: "Al-Fatihah",
    surahNameArabic: "الفاتحة",
  };
  return { id, type: "verse", position, data: verse };
}

function connection(ref: string) {
  return {
    surah: 2,
    ayah: 255,
    ref,
    arabicText: "نص",
    translation: "text",
    surahName: "Al-Baqarah",
    surahNameArabic: "البقرة",
    reason: "reason",
    kind: "thematic",
  };
}

describe("HikmahCanvas expansion node placement", () => {
  beforeEach(() => {
    useCanvasStore.setState({
      nodes: [verseNode("n1", "1:1", { x: 0, y: 0 })] as never,
      edges: [],
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("places a new node near the source's current position, not its position when the expansion started", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([connection("2:255")]),
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

    // Drag the source node far away before the staggered placement lands.
    act(() => {
      useCanvasStore.setState({
        nodes: useCanvasStore
          .getState()
          .nodes.map((n) => (n.id === "n1" ? { ...n, position: { x: 2000, y: 2000 } } : n)),
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    const newNode = useCanvasStore
      .getState()
      .nodes.find((n) => n.id !== "n1" && n.type === "verse");
    expect(newNode).toBeDefined();
    // The new card's column follows the source's current position, not the
    // stale x:0,y:0 snapshot from when the expansion started.
    expect(newNode!.position.x).toBeGreaterThan(1000);
    expect(newNode!.position.y).toBeGreaterThan(1000);
  });

  it("stops adding nodes and edges once the source node is cleared mid-expansion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([connection("2:256"), connection("2:257"), connection("3:2")]),
      })
    );

    render(<HikmahCanvas onSearchOpen={vi.fn()} />);

    act(() => {
      useCanvasStore.getState().setPendingExpand({ nodeId: "n1", ref: "1:1", kind: "thematic" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      useCanvasStore.getState().reset();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(useCanvasStore.getState().nodes).toHaveLength(0);
    expect(useCanvasStore.getState().edges).toHaveLength(0);
  });

  it("stops the remaining stagger when the source is cleared after some nodes were added", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([connection("2:256"), connection("2:257"), connection("3:2")]),
      })
    );

    render(<HikmahCanvas onSearchOpen={vi.fn()} />);

    act(() => {
      useCanvasStore.getState().setPendingExpand({ nodeId: "n1", ref: "1:1", kind: "thematic" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(useCanvasStore.getState().nodes.filter((n) => n.type === "verse")).toHaveLength(2);

    act(() => {
      useCanvasStore.getState().reset();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(useCanvasStore.getState().nodes).toHaveLength(0);
    expect(useCanvasStore.getState().edges).toHaveLength(0);
  });

  it("still adds every verse when Clear → Undo runs mid-expansion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([connection("2:256"), connection("2:257"), connection("3:2")]),
      })
    );

    render(<HikmahCanvas onSearchOpen={vi.fn()} />);

    act(() => {
      useCanvasStore.getState().setPendingExpand({ nodeId: "n1", ref: "1:1", kind: "thematic" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    // Undo restores the source and the first verse, but not the placeholders.
    act(() => {
      useCanvasStore.getState().clearCanvas();
      useCanvasStore.getState().undoClear();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    const refs = useCanvasStore
      .getState()
      .nodes.filter((n) => n.type === "verse")
      .map((n) => (n.data as unknown as Verse).ref);
    expect(refs.sort()).toEqual(["1:1", "2:256", "2:257", "3:2"]);
    expect(useCanvasStore.getState().edges.filter((e) => e.source === "n1")).toHaveLength(3);
  });

  it("shows placeholders in a column beside the source while the AI works", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<never>(() => {}))
    );
    render(<HikmahCanvas onSearchOpen={vi.fn()} />);

    act(() => {
      useCanvasStore.getState().setPendingExpand({ nodeId: "n1", ref: "1:1", kind: "thematic" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const placeholders = useCanvasStore.getState().nodes.filter((n) => n.type === "placeholder");
    expect(placeholders).toHaveLength(3);
    expect(new Set(placeholders.map((n) => n.position.x))).toEqual(
      new Set([NODE_WIDTH + COLUMN_GAP])
    );
    expect(useCanvasStore.getState().expandingKind).toBe("thematic");
  });

  it("never moves cards already on the canvas, and offers to read the new verses", async () => {
    useCanvasStore.setState({
      nodes: [
        verseNode("n1", "1:1", { x: 0, y: 0 }),
        verseNode("n9", "112:1", { x: NODE_WIDTH + COLUMN_GAP, y: 0 }),
      ] as never,
      edges: [],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([connection("2:256"), connection("2:257")]),
      })
    );
    render(<HikmahCanvas onSearchOpen={vi.fn()} />);

    act(() => {
      useCanvasStore.getState().setPendingExpand({ nodeId: "n1", ref: "1:1", kind: "thematic" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    const s = useCanvasStore.getState();
    expect(s.getNodeById("n9")!.position).toEqual({ x: NODE_WIDTH + COLUMN_GAP, y: 0 });
    expect(s.nodes.filter((n) => n.type === "placeholder")).toHaveLength(0);
    const added = s.nodes.filter((n) => n.type === "verse" && !["n1", "n9"].includes(n.id));
    expect(added.map((n) => (n.data as unknown as Verse).placedFrom)).toEqual(["n1", "n1"]);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Added 2 verses by theme to 1:1.");
    act(() => {
      within(status).getByRole("button", { name: "Read them" }).click();
    });
    expect(useCanvasStore.getState().sidebarContent).toEqual({ type: "node", nodeId: "n1" });
  });

  it("offers the other kinds when a first search finds nothing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal("fetch", fetchMock);
    render(<HikmahCanvas onSearchOpen={vi.fn()} />);

    act(() => {
      useCanvasStore.getState().setPendingExpand({ nodeId: "n1", ref: "1:1", kind: "root" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("No new root word links found for 1:1. Try another kind.");
    expect(useCanvasStore.getState().nodes.filter((n) => n.type === "placeholder")).toHaveLength(0);

    act(() => {
      within(status).getByRole("button", { name: "By contrast" }).click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      fromRef: "1:1",
      kind: "contrast",
    });
  });
});
