import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: vi.fn((changes: unknown[], nodes: unknown[]) => nodes),
  applyEdgeChanges: vi.fn((changes: unknown[], edges: unknown[]) => edges),
}));

let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

import { VerseLoader } from "@/app/canvas/CanvasPageClient";
import { useCanvasStore } from "@/store/canvas";
import type { Verse } from "@/types/quran";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function verse(ref: string): Verse {
  const [s, a] = ref.split(":");
  return {
    surah: Number(s),
    ayah: Number(a),
    ref: ref as Verse["ref"],
    arabicText: "نَص",
    translation: "text",
    surahName: "Al-Fatiha",
    surahNameArabic: "الفاتحة",
  };
}

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("VerseLoader — surah bulk-loading effect", () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    mockFetch.mockReset();
    mockSearchParams = new URLSearchParams();
    window.history.replaceState(null, "", "/canvas");
  });

  it("adds every verse and strips the surah param from the URL once loaded", async () => {
    mockSearchParams = new URLSearchParams("surah=1");
    window.history.replaceState(null, "", "/canvas?surah=1");
    mockFetch.mockResolvedValueOnce(jsonResponse([verse("1:1"), verse("1:2")]));

    render(<VerseLoader />);

    await waitFor(() => expect(useCanvasStore.getState().nodes).toHaveLength(2));
    expect(new URL(window.location.href).searchParams.has("surah")).toBe(false);
  });

  it("adds no nodes and does not crash when the fetch fails", async () => {
    mockSearchParams = new URLSearchParams("surah=1");
    window.history.replaceState(null, "", "/canvas?surah=1");
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    render(<VerseLoader />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(useCanvasStore.getState().nodes).toHaveLength(0);
  });

  it("adds no duplicate nodes when the whole surah is already mapped", async () => {
    useCanvasStore.getState().addVerseNode(verse("1:1"), { x: 0, y: 0 });
    useCanvasStore.getState().addVerseNode(verse("1:2"), { x: 400, y: 0 });
    mockSearchParams = new URLSearchParams("surah=1");
    window.history.replaceState(null, "", "/canvas?surah=1");
    mockFetch.mockResolvedValueOnce(jsonResponse([verse("1:1"), verse("1:2")]));

    render(<VerseLoader />);

    await waitFor(() =>
      expect(new URL(window.location.href).searchParams.has("surah")).toBe(false)
    );
    expect(useCanvasStore.getState().nodes).toHaveLength(2);
  });

  it("adds only the missing verses for a partially mapped surah", async () => {
    useCanvasStore.getState().addVerseNode(verse("1:1"), { x: 0, y: 0 });
    mockSearchParams = new URLSearchParams("surah=1");
    window.history.replaceState(null, "", "/canvas?surah=1");
    mockFetch.mockResolvedValueOnce(jsonResponse([verse("1:1"), verse("1:2"), verse("1:3")]));

    render(<VerseLoader />);

    await waitFor(() => expect(useCanvasStore.getState().nodes).toHaveLength(3));
    const refs = useCanvasStore
      .getState()
      .nodes.map((n) => (n.data as unknown as Verse).ref)
      .sort();
    expect(refs).toEqual(["1:1", "1:2", "1:3"]);
  });
});
