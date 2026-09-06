import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
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

  it("shows the new name's reflection (no bleed) when remounted per slug, as the detail page does with key={slug}", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const wrap = (slug: string, text: string) => (
      <NextIntlClientProvider locale="en" messages={en}>
        <NameReflection key={slug} slug={slug} accent="#000" initialReflection={text} />
      </NextIntlClientProvider>
    );

    const { rerender } = render(wrap("ar-rahman", "Ar-Rahman's reflection."));
    expect(screen.getByText("Ar-Rahman's reflection.")).toBeInTheDocument();

    // The page keys these components by slug, so a prev/next navigation remounts
    // rather than reusing the fetch-once state that caused the previous name's
    // text to persist under the new heading.
    rerender(wrap("ar-rahim", "Ar-Rahim's reflection."));

    expect(screen.getByText("Ar-Rahim's reflection.")).toBeInTheDocument();
    expect(screen.queryByText("Ar-Rahman's reflection.")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
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
