import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderWithIntl as render } from "../../test-utils/render-with-intl";
import type { Verse, SearchResult, SearchResponse } from "@/types/quran";

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: vi.fn((changes: unknown[], nodes: unknown[]) => nodes),
  applyEdgeChanges: vi.fn((changes: unknown[], edges: unknown[]) => edges),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { useCanvasStore } from "@/store/canvas";
import { SearchDialog } from "@/components/search/SearchDialog";

function makeResult(ref: string, surahName: string): SearchResult {
  return {
    ref: ref as SearchResult["ref"],
    surahName,
    surahNameArabic: "سورة",
    snippet: `snippet for ${ref}`,
    arabicText: "نص",
    translation: "text",
  };
}

function makeVerse(ref: string): Verse {
  const [s, a] = ref.split(":");
  return {
    surah: Number(s),
    ayah: Number(a),
    ref: ref as Verse["ref"],
    arabicText: "نص",
    translation: "text",
    surahName: "Surah",
    surahNameArabic: "سورة",
  };
}

describe("SearchDialog keyboard navigation", () => {
  const results = [makeResult("2:1", "Al-Baqarah"), makeResult("2:2", "Al-Baqarah")];

  beforeEach(() => {
    useCanvasStore.getState().reset();
    mockPush.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("/api/search")) {
          const body: SearchResponse = { results, total: results.length, page: 1, pageSize: 10 };
          return { ok: true, json: async () => body, headers: new Headers() } as Response;
        }
        if (url.startsWith("/api/verse/")) {
          const ref = url.replace("/api/verse/", "").replace("/", ":");
          return { ok: true, json: async () => makeVerse(ref) } as Response;
        }
        throw new Error(`unexpected fetch ${url}`);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function openDialogWithResults(onClose = vi.fn()) {
    render(<SearchDialog open onClose={onClose} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "guidance" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2), { timeout: 2000 });
    return { input, onClose };
  }

  it("moves the highlight down and up through results with arrow keys", async () => {
    const { input } = await openDialogWithResults();
    const options = screen.getAllByRole("option");

    expect(options[0]).toHaveAttribute("aria-selected", "false");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "false");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");

    // wraps back to the first result
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
  });

  it("Enter selects the highlighted result instead of navigating to the full results page", async () => {
    const onClose = vi.fn();
    const { input } = await openDialogWithResults(onClose);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(useCanvasStore.getState().nodes).toHaveLength(1));
    expect(useCanvasStore.getState().nodes[0].data).toMatchObject({ ref: "2:1" });
    expect(mockPush).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("Enter falls back to viewing all results when nothing is highlighted", async () => {
    const onClose = vi.fn();
    const { input } = await openDialogWithResults(onClose);

    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("/search?q="));
    expect(useCanvasStore.getState().nodes).toHaveLength(0);
  });

  it("hovering a result updates the highlight", async () => {
    await openDialogWithResults();
    const options = screen.getAllByRole("option");

    fireEvent.mouseEnter(options[1]);
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
  });
});
