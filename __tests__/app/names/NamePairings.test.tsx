import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/__tests__/test-utils/render-with-intl";
import { NamePairings } from "@/app/names/[slug]/NamePairings";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PAIRING = {
  name: "ar-rahim",
  transliteration: "Ar-Rahim",
  arabic: "الرَّحِيم",
  explanation: "One sentence on why this pairing balances Ar-Rahman.",
};

describe("NamePairings", () => {
  it("renders server-prefetched pairings immediately and never fetches", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderWithIntl(<NamePairings slug="ar-rahman" accent="#000" initialPairings={[PAIRING]} />);

    expect(screen.getByText("Ar-Rahim")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to fetching when no initial pairings are provided (cache miss)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [PAIRING],
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithIntl(<NamePairings slug="ar-rahman" accent="#000" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/names/ar-rahman/pairings"));
    expect(await screen.findByText("Ar-Rahim")).toBeInTheDocument();
  });

  it("shows a visible error message (not a blank render) when the fetch fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderWithIntl(<NamePairings slug="ar-rahman" accent="#000" />);

    await waitFor(() =>
      expect(screen.getByText("Could not load pairings at this time.")).toBeInTheDocument()
    );
    expect(container).not.toBeEmptyDOMElement();
  });

  it("still hides the section for a legitimately-empty successful result (not an error)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderWithIntl(<NamePairings slug="ar-rahman" accent="#000" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
