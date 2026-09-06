import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";

// The page prefetches name content server-side; return a per-slug value so a
// prev/next navigation would visibly bleed if the page stopped keying its
// client sections by slug.
const { getCachedNameContent } = vi.hoisted(() => ({
  getCachedNameContent: vi.fn(async (slug: string, kind: string) =>
    kind === "reflection" ? `Reflection for ${slug}` : []
  ),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/names/name-content", () => ({ getCachedNameContent }));
vi.mock("@/lib/i18n/request-prefs", () => ({ getUiLocale: async () => "en" }));
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
    getCachedNameContent.mockClear();
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
});
