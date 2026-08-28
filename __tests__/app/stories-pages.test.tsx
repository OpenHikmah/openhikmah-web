import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { createTranslator } from "use-intl/core";
import type { Story } from "@/lib/stories";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";
import az from "@/messages/az.json";
import ru from "@/messages/ru.json";

const MESSAGES = { en, tr, az, ru };

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
// next-intl/server's getTranslations relies on the RSC build, which isn't
// resolved under vitest's jsdom environment — build a real translator
// (ICU formatting included) from the same locale the page itself resolves.
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => {
    const locale = (await mockGetUiLocale()) as keyof typeof MESSAGES;
    // `namespace` can't be narrowed to createTranslator's generic NamespaceKeys
    // type from a plain runtime string; this mock only ever runs in tests.
    return createTranslator({ locale, messages: MESSAGES[locale], namespace: namespace as never });
  },
}));
vi.mock("@/lib/quran/verse-resolver", () => ({ resolveVerse: mockResolveVerse }));
vi.mock("@/lib/stories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stories")>();
  return {
    ...actual,
    STORIES: [SYNTHETIC_STORY],
    getStoryBySlug: (slug: string) => (slug === SYNTHETIC_STORY.slug ? SYNTHETIC_STORY : undefined),
    // Pages call the flag-aware accessors, not STORIES/getStoryBySlug directly —
    // mirror the same synthetic-only fixture so these locale tests are unaffected
    // by story_flags (that filtering is covered by stories-visibility.test.ts).
    listVisibleStories: async () => [SYNTHETIC_STORY],
    getVisibleStoryBySlug: async (slug: string) =>
      slug === SYNTHETIC_STORY.slug ? SYNTHETIC_STORY : undefined,
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

// extractText only walks `children` — this digs out an element by its
// component type so tests can assert on non-children props like `label`.
function findByType(node: unknown, type: unknown): { props: Record<string, unknown> } | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByType(child, type);
      if (found) return found;
    }
    return undefined;
  }
  if (node && typeof node === "object" && "type" in node && "props" in node) {
    const el = node as { type: unknown; props: Record<string, unknown> };
    if (el.type === type) return el;
    return findByType(el.props?.children, type);
  }
  return undefined;
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

  it("index page chrome (eyebrow/heading/footer) renders in the active locale, not hardcoded English", async () => {
    mockGetUiLocale.mockResolvedValue("tr");
    const { default: StoriesPage } = await import("@/app/stories/page");
    const text = extractText(await StoriesPage());
    expect(text).toContain("Peygamber Kıssaları");
    expect(text.join(" ")).toContain("Maturidi/Hanefi geleneğine göre");
    expect(text).not.toContain("Prophetic Narratives");
  });

  it("detail page back link and footer render in the active locale", async () => {
    mockGetUiLocale.mockResolvedValue("tr");
    const { default: StoryDetailPage } = await import("@/app/stories/[slug]/page");
    const text = extractText(
      await StoryDetailPage({ params: Promise.resolve({ slug: "test-story" }) })
    );
    expect(text).toContain("Tüm Kıssalar");
    expect(text.join(" ")).toContain("Maturidi/Hanefi geleneğine göre");
    expect(text).not.toContain("All Stories");
  });

  it("shows a translated, correctly pluralized missing-verses notice when a verse can't be resolved", async () => {
    mockGetUiLocale.mockResolvedValue("tr");
    mockResolveVerse.mockResolvedValue(null);
    const { default: StoryDetailPage } = await import("@/app/stories/[slug]/page");
    const text = extractText(
      await StoryDetailPage({ params: Promise.resolve({ slug: "test-story" }) })
    );
    expect(text.join(" ")).toContain("1 ayet bu bölümde şu anda yüklenemedi");
  });

  it("passes a translated label into the Open on canvas button", async () => {
    mockGetUiLocale.mockResolvedValue("tr");
    mockResolveVerse.mockResolvedValue({
      ref: "12:1",
      surah: 12,
      ayah: 1,
      arabicText: "الر ۚ تِلْكَ آيَاتُ الْكِتَابِ الْمُبِينِ",
      translation: "Alif, Lam, Ra. These are the verses of the clear Book.",
      surahName: "Yusuf",
      surahNameArabic: "يوسف",
    });
    const { default: StoryDetailPage } = await import("@/app/stories/[slug]/page");
    const { OpenOnCanvasButton } = await import("@/app/stories/[slug]/OpenOnCanvasButton");
    const tree = await StoryDetailPage({ params: Promise.resolve({ slug: "test-story" }) });
    const button = findByType(tree, OpenOnCanvasButton);
    expect(button?.props.label).toBe("Tuvalde aç");
  });
});
