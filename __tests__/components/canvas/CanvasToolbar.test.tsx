import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithIntl as render } from "../../test-utils/render-with-intl";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useAudioStore } from "@/store/audio";
import type { Verse, VerseRef } from "@/types/quran";
import type { Node } from "@xyflow/react";

vi.mock("@xyflow/react", () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useReactFlow: () => ({ fitView: vi.fn() }),
}));

import { CanvasToolbar } from "@/components/canvas/CanvasToolbar";

function verseNode(): Node {
  const verse: Verse = {
    surah: 1,
    ayah: 1,
    ref: "1:1" as VerseRef,
    arabicText: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    translation: "text",
    surahName: "Al-Fatihah",
    surahNameArabic: "الفاتحة",
  };
  return { id: "n1", type: "verse", position: { x: 0, y: 0 }, data: { ...verse } } as Node;
}

function chooseFromMore(name: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("CanvasToolbar layout", () => {
  beforeEach(() => {
    useCanvasStore.setState({ nodes: [verseNode()], edges: [] });
    useAuthStore.setState({ accessToken: null });
  });

  it("keeps only Search, Listen, Share and More in the bar", () => {
    render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Listen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
    for (const gone of [/export/i, /^fit$/i, /^clear$/i, /sign in to save/i]) {
      expect(screen.queryByRole("button", { name: gone })).not.toBeInTheDocument();
    }
  });

  it("puts saving, downloads and Clear canvas in the More menu", () => {
    render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    for (const item of ["Sign in to save", "Download image", "Download PDF", "Clear canvas"]) {
      expect(screen.getByRole("button", { name: item })).toBeInTheDocument();
    }
  });

  it("clears the canvas at once and keeps a snapshot for Undo", () => {
    render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    chooseFromMore("Clear canvas");
    expect(useCanvasStore.getState().nodes).toHaveLength(0);
    expect(useCanvasStore.getState().clearedSnapshot?.nodes).toHaveLength(1);
  });

  it("reads every verse aloud in Qur'an order", () => {
    const playGraph = vi.fn();
    useAudioStore.setState({ playGraph, currentRef: null });
    useCanvasStore.setState({
      nodes: [
        {
          ...verseNode(),
          id: "a",
          data: { ...verseNode().data, ref: "2:255", surah: 2, ayah: 255 },
        },
        verseNode(),
      ],
      edges: [],
    });
    render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Listen" }));
    expect(playGraph.mock.calls[0][0].map((v: { ref: string }) => v.ref)).toEqual(["1:1", "2:255"]);
  });
});

describe("CanvasToolbar save workspace name", () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useAuthStore.setState({ accessToken: "test-token" as any });
  });

  it("pluralizes the ICU-formatted verse count in the saved workspace name", async () => {
    useCanvasStore.setState({ nodes: [verseNode()], edges: [] });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    chooseFromMore("Save to my canvases");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.name).toMatch(/^1 verse — /);
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");

    vi.unstubAllGlobals();
  });

  it("uses the plural form for more than one verse", async () => {
    useCanvasStore.setState({
      nodes: [verseNode(), { ...verseNode(), id: "n2" }],
      edges: [],
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<CanvasToolbar onSearchOpen={vi.fn()} />);
    chooseFromMore("Save to my canvases");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.name).toMatch(/^2 verses — /);

    vi.unstubAllGlobals();
  });
});
