import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import type { Story } from "@/lib/stories";

// A synthetic story with a populated `tr` field (no real story data has one yet),
// so these tests can exercise the actual locale-swap branch of resolveLocalized,
// not just its English-fallback branch (already covered by __tests__/lib/stories.test.ts).
const SYNTHETIC_STORY: Story = {
  slug: "test-story",
  name: { en: "Test Story", tr: "Test Hikayesi" },
  arabicName: "قصة الاختبار",
  tagline: { en: "An English tagline", tr: "Türkçe bir slogan" },
  intro: { en: "An English intro." },
  primarySurahs: [12],
  chapters: [
    {
      id: "chapter-1",
      title: { en: "Chapter One", tr: "Birinci Bölüm" },
      narrative: { en: "English narrative." },
      verseRefs: ["12:1"],
    },
  ],
  themes: [],
};

const { mockGetUiLocale, mockGetQuranEdition, mockResolveVerse } = vi.hoisted(() => ({
  mockGetUiLocale: vi.fn(),
  mockGetQuranEdition: vi.fn().mockResolvedValue("en.sahih"),
  mockResolveVerse: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/i18n/request-prefs", () => ({
  getUiLocale: mockGetUiLocale,
  getQuranEdition: mockGetQuranEdition,
}));
vi.mock("@/lib/quran/verse-resolver", () => ({ resolveVerse: mockResolveVerse }));
vi.mock("@/lib/stories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stories")>();
  return {
    ...actual,
    STORIES: [SYNTHETIC_STORY],
    getStoryBySlug: (slug: string) => (slug === SYNTHETIC_STORY.slug ? SYNTHETIC_STORY : undefined),
  };
});

// Both pages are async Server Components. Calling them directly (without a DOM
// renderer) resolves their data-fetching and returns a plain React element tree
// — LandingHeader/MobileNavBar's own hooks never execute since nothing renders
// them, so no next-intl/next-navigation providers are needed for this.
function extractText(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(extractText);
  if (node && typeof node === "object" && "props" in node) {
    return extractText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return [];
}

describe("Stories pages — locale-aware rendering", () => {
  beforeEach(() => {
    mockGetUiLocale.mockReset();
    mockResolveVerse.mockReset().mockResolvedValue(null);
  });

  it("index page shows the locale-specific name/tagline when present", async () => {
    mockGetUiLocale.mockResolvedValue("tr");
    const { default: StoriesPage } = await import("@/app/stories/page");
    const text = extractText(await StoriesPage());
    expect(text).toContain("Test Hikayesi");
    expect(text).toContain("Türkçe bir slogan");
    expect(text).not.toContain("Test Story");
  });

  it("index page falls back to English when no locale-specific field exists", async () => {
    mockGetUiLocale.mockResolvedValue("az");
    const { default: StoriesPage } = await import("@/app/stories/page");
    const text = extractText(await StoriesPage());
    expect(text).toContain("Test Story");
    expect(text).toContain("An English tagline");
  });

  it("detail page hero and chapter content resolve the locale-specific text", async () => {
    mockGetUiLocale.mockResolvedValue("tr");
    const { default: StoryDetailPage } = await import("@/app/stories/[slug]/page");
    const text = extractText(
      await StoryDetailPage({ params: Promise.resolve({ slug: "test-story" }) })
    );
    expect(text).toContain("Test Hikayesi");
    expect(text).toContain("Türkçe bir slogan");
    expect(text).toContain("Birinci Bölüm");
    // intro/narrative have no `tr` field on the fixture — English fallback.
    expect(text).toContain("An English intro.");
    expect(text).toContain("English narrative.");
  });

  it("generateMetadata resolves the locale-specific name/tagline", async () => {
    mockGetUiLocale.mockResolvedValue("tr");
    const { generateMetadata } = await import("@/app/stories/[slug]/page");
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "test-story" }) });
    expect(metadata.title).toContain("Test Hikayesi");
    expect(metadata.description).toBe("Türkçe bir slogan");
  });
});
