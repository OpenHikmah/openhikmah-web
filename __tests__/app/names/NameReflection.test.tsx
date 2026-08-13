import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/__tests__/test-utils/render-with-intl";
import { NameReflection } from "@/app/names/[slug]/NameReflection";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NameReflection", () => {
  it("renders server-prefetched reflection immediately and never fetches", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderWithIntl(
      <NameReflection slug="ar-rahman" accent="#000" initialReflection="A prefetched reflection." />
    );

    expect(screen.getByText("A prefetched reflection.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to fetching when no initial reflection is provided (cache miss)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reflection: "A fetched reflection." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithIntl(<NameReflection slug="ar-rahman" accent="#000" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/names/ar-rahman/reflection"));
    expect(await screen.findByText("A fetched reflection.")).toBeInTheDocument();
  });

  it("shows a visible error message (not a blank render) when the fetch fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderWithIntl(<NameReflection slug="ar-rahman" accent="#000" />);

    await waitFor(() =>
      expect(screen.getByText("Could not load the reflection at this time.")).toBeInTheDocument()
    );
    expect(container).not.toBeEmptyDOMElement();
  });

  it("shows the error message, not a perpetual skeleton, when the API returns 200 with an empty reflection", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reflection: "" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithIntl(<NameReflection slug="ar-rahman" accent="#000" />);

    await waitFor(() =>
      expect(screen.getByText("Could not load the reflection at this time.")).toBeInTheDocument()
    );
  });
});
