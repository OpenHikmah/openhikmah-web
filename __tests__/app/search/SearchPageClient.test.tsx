import { screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

const mockSearchParams = new URLSearchParams({ q: "mercy" });
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/search",
}));

import { SearchPageClient } from "@/app/search/SearchPageClient";

describe("SearchPageClient — rate-limit vs. genuine empty results", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a distinct rate-limited message (with retry) for a 429 response", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 429 }));

    await act(async () => {
      renderWithIntl(<SearchPageClient />);
    });

    expect(screen.getByText(/searching a bit fast/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("shows the generic error message for a non-429 failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));

    await act(async () => {
      renderWithIntl(<SearchPageClient />);
    });

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("shows genuine no-match copy for a real empty 200 response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), {
        status: 200,
      })
    );

    await act(async () => {
      renderWithIntl(<SearchPageClient />);
    });

    expect(screen.getByText(/no exact matches/i)).toBeInTheDocument();
  });
});
