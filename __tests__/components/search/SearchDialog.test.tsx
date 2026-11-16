import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import type { Verse, SearchResult, SearchResponse } from "@/types/quran";

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: vi.fn((changes: unknown[], nodes: unknown[]) => nodes),
  applyEdgeChanges: vi.fn((changes: unknown[], edges: unknown[]) => edges),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { useCanvasStore } from "@/store/canvas";
import { SearchDialog } from "@/components/search/SearchDialog";

// Real, verified text (Sahih International / ar-simple-clean) —
// test fixtures render Quranic text and must not use placeholder strings.
const VERSE_TEXT: Record<string, { arabic: string; translation: string }> = {
  "2:1": { arabic: "الم", translation: "Alif, Lam, Meem." },
  "2:2": {
    arabic: "ذَٰلِكَ الْكِتَابُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًى لِّلْمُتَّقِينَ",
    translation:
      "This is the Book about which there is no doubt, a guidance for those conscious of Allah -",
  },
  "94:5": {
    arabic: "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا",
    translation: "For indeed, with hardship will be ease.",
  },
};

function makeResult(ref: string, surahName: string): SearchResult {
  const text = VERSE_TEXT[ref];
  return {
    ref: ref as SearchResult["ref"],
    surahName,
    surahNameArabic: "سورة البقرة",
    snippet: text.translation,
    arabicText: text.arabic,
    translation: text.translation,
  };
}

function makeVerse(ref: string): Verse {
  const [s, a] = ref.split(":");
  const text = VERSE_TEXT[ref];
  return {
    surah: Number(s),
    ayah: Number(a),
    ref: ref as Verse["ref"],
    arabicText: text.arabic,
    translation: text.translation,
    surahName: "Al-Baqarah",
    surahNameArabic: "سورة البقرة",
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
    renderWithIntl(<SearchDialog open onClose={onClose} />);
    const input = screen.getByRole("combobox");
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

  it("exposes the highlighted result to assistive tech via aria-activedescendant", async () => {
    const { input } = await openDialogWithResults();
    expect(input).not.toHaveAttribute("aria-activedescendant");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id);
  });
});

describe("SearchDialog selected-result fetch failure", () => {
  const results = [makeResult("2:1", "Al-Baqarah"), makeResult("2:2", "Al-Baqarah")];

  beforeEach(() => {
    useCanvasStore.getState().reset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("/api/search")) {
          const body: SearchResponse = { results, total: results.length, page: 1, pageSize: 10 };
          return { ok: true, json: async () => body, headers: new Headers() } as Response;
        }
        if (url.startsWith("/api/verse/")) {
          return { ok: false, json: async () => ({}) } as Response;
        }
        throw new Error(`unexpected fetch ${url}`);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces an error instead of silently doing nothing when the selected result fails to load", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithIntl(<SearchDialog open onClose={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "guidance" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2), { timeout: 2000 });

    fireEvent.click(screen.getAllByRole("option")[0]);

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
    expect(useCanvasStore.getState().nodes).toHaveLength(0);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch selected search result:",
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });
});

describe("SearchDialog view-all-results footer hint", () => {
  const results = [makeResult("2:1", "Al-Baqarah"), makeResult("2:2", "Al-Baqarah")];

  beforeEach(() => {
    useCanvasStore.getState().reset();
    mockPush.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("/api/search")) {
          // total (5) exceeds results.length (2) so the "view all results" footer renders.
          const body: SearchResponse = { results, total: 5, page: 1, pageSize: 10 };
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

  it("hides the 'press Enter to view all' hint once a result is highlighted, since Enter now selects it instead", async () => {
    renderWithIntl(<SearchDialog open onClose={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "guidance" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2), { timeout: 2000 });

    expect(screen.getByText("Enter")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.queryByText("Enter")).not.toBeInTheDocument();

    // The footer button itself (click-to-view-all) stays available regardless of highlight.
    expect(screen.getByRole("button", { name: /results/i })).toBeInTheDocument();
  });
});

describe("SearchDialog — rate-limit vs. genuine empty results", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    useCanvasStore.setState({ nodes: [], viewport: { x: 0, y: 0, zoom: 1 } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function typeQuery(text: string) {
    const input = screen.getByPlaceholderText(/search topics/i);
    fireEvent.change(input, { target: { value: text } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(420);
    });
  }

  it("shows a distinct message for a 429 response, not the generic 'no results' copy", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 429 }));

    renderWithIntl(<SearchDialog open={true} onClose={vi.fn()} />);
    await typeQuery("mercy");

    expect(screen.getByText(/searching a bit fast/i)).toBeInTheDocument();
    expect(screen.queryByText(/no results found/i)).not.toBeInTheDocument();
  });

  it("shows an 'unavailable' message when the upstream keyword API failed, not 'no results'", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 10 }), {
        status: 200,
        headers: { "x-search-error": "keyword-unavailable" },
      })
    );

    renderWithIntl(<SearchDialog open={true} onClose={vi.fn()} />);
    await typeQuery("mercy");

    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/no results found/i)).not.toBeInTheDocument();
  });

  it("shows an 'unavailable' message when the search request itself rejects, not 'no results'", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));

    renderWithIntl(<SearchDialog open={true} onClose={vi.fn()} />);
    await typeQuery("mercy");

    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/no results found/i)).not.toBeInTheDocument();
  });

  it("still shows the plain 'no results' copy for a genuine zero-match 200 response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 10 }), {
        status: 200,
      })
    );

    renderWithIntl(<SearchDialog open={true} onClose={vi.fn()} />);
    await typeQuery("zzzzznotreal");

    expect(screen.getByText(/no results found/i)).toBeInTheDocument();
  });
});

describe("SearchDialog query transitions", () => {
  const mockFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
  const emptyResults: SearchResponse = { results: [], total: 0, page: 1, pageSize: 10 };

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    useCanvasStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function typeQuery(value: string) {
    fireEvent.change(screen.getByRole("combobox"), { target: { value } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(420);
    });
  }

  function pendingRequest(_url: string, init?: RequestInit) {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError"))
      );
    });
  }

  it("clears the verse preview when switching to text search", async () => {
    mockFetch
      .mockResolvedValueOnce(Response.json(makeVerse("2:1")))
      .mockResolvedValueOnce(Response.json(emptyResults));
    renderWithIntl(<SearchDialog open onClose={vi.fn()} />);

    await typeQuery("2:1");
    expect(screen.getByText(VERSE_TEXT["2:1"].translation)).toBeInTheDocument();

    await typeQuery("mercy");
    expect(screen.queryByText(VERSE_TEXT["2:1"].translation)).not.toBeInTheDocument();
    expect(screen.getByText(/no results found/i)).toBeInTheDocument();
  });

  it("clears the preview error so empty search results can appear", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json(emptyResults));
    renderWithIntl(<SearchDialog open onClose={vi.fn()} />);

    await typeQuery("99:99");
    expect(screen.getByText(/verse not found/i)).toBeInTheDocument();

    await typeQuery("mercy");
    expect(screen.queryByText(/verse not found/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no results found/i)).toBeInTheDocument();
  });

  it("stops showing busy after switching from a pending search to a preview", async () => {
    mockFetch
      .mockImplementationOnce(pendingRequest)
      .mockResolvedValueOnce(Response.json(makeVerse("2:1")));
    renderWithIntl(<SearchDialog open onClose={vi.fn()} />);

    await typeQuery("mercy");
    expect(mockFetch).toHaveBeenCalledWith("/api/search?q=mercy", expect.anything());
    const signal = mockFetch.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    expect(screen.getByRole("dialog").querySelector(".animate-spin")).not.toBeNull();

    await typeQuery("2:1");
    expect(signal?.aborted).toBe(true);
    expect(screen.getByText(VERSE_TEXT["2:1"].translation)).toBeInTheDocument();
    expect(screen.getByRole("dialog").querySelector(".animate-spin")).toBeNull();
  });

  it("stops showing busy after switching from a pending preview to search", async () => {
    mockFetch
      .mockImplementationOnce(pendingRequest)
      .mockResolvedValueOnce(Response.json(emptyResults));
    renderWithIntl(<SearchDialog open onClose={vi.fn()} />);

    await typeQuery("2:1");
    expect(mockFetch).toHaveBeenCalledWith("/api/verse/2/1", expect.anything());
    const signal = mockFetch.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    expect(screen.getByRole("dialog").querySelector(".animate-spin")).not.toBeNull();

    await typeQuery("mercy");
    expect(signal?.aborted).toBe(true);
    expect(screen.getByText(/no results found/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog").querySelector(".animate-spin")).toBeNull();
  });

  it.each(["clear button", "empty input"])("clears a pending preview via %s", async (method) => {
    mockFetch.mockImplementationOnce(pendingRequest);
    renderWithIntl(<SearchDialog open onClose={vi.fn()} />);

    await typeQuery("2:1");
    expect(mockFetch).toHaveBeenCalledWith("/api/verse/2/1", expect.anything());
    const signal = mockFetch.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    expect(screen.getByRole("dialog").querySelector(".animate-spin")).not.toBeNull();

    if (method === "clear button") {
      fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    } else {
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(420);
    });

    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(signal?.aborted).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog").querySelector(".animate-spin")).toBeNull();
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeEnabled();
    }
  });

  it.each(["clear button", "empty input"])(
    "preserves pending selection loading when clearing via %s",
    async (method) => {
      const results = [makeResult("2:1", "Al-Baqarah")];
      let resolveSelection!: (response: Response) => void;
      mockFetch
        .mockResolvedValueOnce(Response.json({ ...emptyResults, results, total: 1 }))
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              resolveSelection = resolve;
            })
        );
      const onClose = vi.fn();
      renderWithIntl(<SearchDialog open onClose={onClose} />);

      await typeQuery("guidance");
      fireEvent.click(screen.getByRole("option"));
      expect(mockFetch).toHaveBeenCalledWith("/api/verse/2/1", expect.anything());
      const signal = mockFetch.mock.calls[1][1]?.signal;

      if (method === "clear button") {
        fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
      } else {
        fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
      }
      await act(async () => {
        await vi.advanceTimersByTimeAsync(420);
      });

      expect(signal?.aborted).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("option")).not.toBeInTheDocument();
      expect(screen.getByRole("dialog").querySelector(".animate-spin")).not.toBeNull();
      const seedButtons = screen
        .getAllByRole("button")
        .filter((button) => button.getAttribute("aria-label") !== "Close search");
      expect(seedButtons).toHaveLength(6);
      for (const button of seedButtons) expect(button).toBeDisabled();

      await act(async () => {
        resolveSelection(Response.json(makeVerse("2:1")));
      });
      expect(screen.getByRole("dialog").querySelector(".animate-spin")).toBeNull();
      for (const button of seedButtons) expect(button).toBeEnabled();
      expect(useCanvasStore.getState().nodes).toHaveLength(1);
      expect(useCanvasStore.getState().nodes[0].data.ref).toBe("2:1");
      expect(onClose).toHaveBeenCalledOnce();
    }
  );

  it("keeps showing busy for a pending selection when a new search finishes", async () => {
    const results = [makeResult("2:1", "Al-Baqarah")];
    let resolveSelection!: (response: Response) => void;
    mockFetch
      .mockResolvedValueOnce(Response.json({ ...emptyResults, results, total: 1 }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSelection = resolve;
          })
      )
      .mockResolvedValueOnce(Response.json(emptyResults));
    const onClose = vi.fn();
    renderWithIntl(<SearchDialog open onClose={onClose} />);

    await typeQuery("guidance");
    fireEvent.click(screen.getByRole("option"));
    expect(mockFetch).toHaveBeenCalledWith("/api/verse/2/1", expect.anything());
    const signal = mockFetch.mock.calls[1][1]?.signal;

    await typeQuery("mercy");
    expect(signal?.aborted).toBe(false);
    expect(screen.getByRole("dialog").querySelector(".animate-spin")).not.toBeNull();
    expect(screen.queryByText(/no results found/i)).not.toBeInTheDocument();

    await act(async () => {
      resolveSelection(Response.json(makeVerse("2:1")));
    });
    expect(screen.getByRole("dialog").querySelector(".animate-spin")).toBeNull();
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().nodes[0].data.ref).toBe("2:1");
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("SearchDialog — related-by-meaning results", () => {
  const mockFetch = vi.fn();
  const related = [makeResult("94:5", "Ash-Sharh")];

  beforeEach(() => {
    useCanvasStore.getState().reset();
    mockPush.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function respondWith(body: SearchResponse) {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/search")) {
        return { ok: true, json: async () => body, headers: new Headers() } as Response;
      }
      if (url.startsWith("/api/verse/")) {
        const ref = url.replace("/api/verse/", "").replace("/", ":");
        return { ok: true, json: async () => makeVerse(ref) } as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    });
  }

  it("renders related results below the primary results, outside keyboard-nav option semantics", async () => {
    const results = [makeResult("2:1", "Al-Baqarah")];
    await respondWith({ results, related, total: results.length, page: 1, pageSize: 10 });

    renderWithIntl(<SearchDialog open onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "guidance" } });

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(screen.getByText("Related by meaning")).toBeInTheDocument();
    expect(screen.getByText(related[0].translation)).toBeInTheDocument();
    // Only the primary result is a navigable combobox option — the related
    // row is clickable but not part of arrow-key/Enter navigation.
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("selecting a related result maps it onto the canvas, same as a primary result", async () => {
    await respondWith({ results: [], related, total: 0, page: 1, pageSize: 10 });

    renderWithIntl(<SearchDialog open onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "hardship" } });

    const relatedRow = await screen.findByText(related[0].translation);
    fireEvent.click(relatedRow.closest("button")!);

    await waitFor(() => expect(useCanvasStore.getState().nodes).toHaveLength(1));
    expect(useCanvasStore.getState().nodes[0].data).toMatchObject({ ref: "94:5" });
  });

  it("clears related results once the query changes", async () => {
    await respondWith({ results: [], related, total: 0, page: 1, pageSize: 10 });

    renderWithIntl(<SearchDialog open onClose={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "hardship" } });
    await screen.findByText("Related by meaning");

    fireEvent.change(input, { target: { value: "" } });
    expect(screen.queryByText("Related by meaning")).not.toBeInTheDocument();
  });
});
