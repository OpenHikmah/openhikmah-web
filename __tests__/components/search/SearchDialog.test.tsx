import { screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { SearchDialog } from "@/components/search/SearchDialog";
import { useCanvasStore } from "@/store/canvas";

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
