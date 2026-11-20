import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";

// The page prefetches name content server-side; return a per-slug value so a
// prev/next navigation would visibly bleed if the page stopped keying its
// client sections by slug.
const { getCachedNameContent, getUiLocale, hashNameSource } = vi.hoisted(() => ({
  // Full page signature, so call assertions can read the locale argument.
  getCachedNameContent: vi.fn(
    async (
      slug: string,
      kind: string,
      _locale: string,
      _version: number,
      _sourceHash?: string
    ): Promise<unknown> => (kind === "reflection" ? `Reflection for ${slug}` : [])
  ),
  getUiLocale: vi.fn(async () => "en"),
  hashNameSource: vi.fn((_source: unknown) => "hashed"),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/names/name-content", () => ({ getCachedNameContent, hashNameSource }));
vi.mock("@/lib/i18n/request-prefs", () => ({ getUiLocale }));
vi.mock("@/components/layout/LandingHeader", () => ({ LandingHeader: () => null }));
vi.mock("@/components/layout/MobileNavBar", () => ({ MobileNavBar: () => null }));

// Stateful stubs: each freezes the slug it first mounted with. If the page stops
// keying the section by slug, these keep rendering the previous name after a
// prev/next nav — which is exactly the bleed this test guards against.
vi.mock("@/app/names/[slug]/NameVerses", async () => {
  const { useState } = await import("react");
  return {
    NameVerses: ({ slug }: { slug: string }) => {
      const [initial] = useState(slug);
      return <div>Verses for {initial}</div>;
    },
  };
});
vi.mock("@/app/names/[slug]/NamePairings", async () => {
  const { useState } = await import("react");
  return {
    NamePairings: ({ slug }: { slug: string }) => {
      const [initial] = useState(slug);
      return <div>Pairings for {initial}</div>;
    },
  };
});

import NameDetailPage from "@/app/names/[slug]/page";

async function renderSlug(slug: string) {
  const tree = await NameDetailPage({ params: Promise.resolve({ slug }) });
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {tree}
    </NextIntlClientProvider>
  );
}

describe("NameDetailPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn()); // NameReflection must not fetch on a prefetch hit
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    getCachedNameContent.mockReset();
    getCachedNameContent.mockImplementation(async (slug: string, kind: string) =>
      kind === "reflection" ? `Reflection for ${slug}` : []
    );
    getUiLocale.mockReset();
    getUiLocale.mockImplementation(async () => "en");
    hashNameSource.mockClear();
  });

  it("keys the reflection/pairings/verses section by slug so a prev/next nav shows the new name, not the old", async () => {
    const { rerender } = await renderSlug("ar-rahman");
    expect(screen.getByText("Reflection for ar-rahman")).toBeInTheDocument();
    expect(screen.getByText("Pairings for ar-rahman")).toBeInTheDocument();
    expect(screen.getByText("Verses for ar-rahman")).toBeInTheDocument();

    const nextTree = await NameDetailPage({ params: Promise.resolve({ slug: "ar-rahim" }) });
    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        {nextTree}
      </NextIntlClientProvider>
    );

    // key={slug} on the section container remounts all three client sections, so
    // each seeds from the new name instead of keeping ar-rahman's state.
    expect(screen.getByText("Reflection for ar-rahim")).toBeInTheDocument();
    expect(screen.getByText("Pairings for ar-rahim")).toBeInTheDocument();
    expect(screen.getByText("Verses for ar-rahim")).toBeInTheDocument();
    expect(screen.queryByText(/for ar-rahman$/)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips the translated reflection/pairings prefetch when the English source is not cached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}))
    );
    getUiLocale.mockImplementation(async () => "tr");
    getCachedNameContent.mockImplementation(async (slug: string, kind: string, locale: string) => {
      if (locale === "en") return null;
      return kind === "reflection" ? `Reflection for ${slug}` : "translated";
    });

    await renderSlug("ar-rahman");

    // An uncached English row means there is no expected hash, and without one a
    // stored translation would be served unchecked — so only the English-source
    // lookups may run, and the client fetch regenerates the translation instead.
    const reflectionCalls = getCachedNameContent.mock.calls.filter((c) => c[1] === "reflection");
    const pairingsCalls = getCachedNameContent.mock.calls.filter((c) => c[1] === "pairings");
    expect(reflectionCalls).toHaveLength(1);
    expect(pairingsCalls).toHaveLength(1);
    expect(reflectionCalls.every((c) => c[2] === "en")).toBe(true);
    expect(pairingsCalls.every((c) => c[2] === "en")).toBe(true);
  });
});
