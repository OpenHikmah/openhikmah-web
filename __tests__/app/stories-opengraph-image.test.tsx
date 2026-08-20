import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetVisibleStoryBySlug, mockImageResponse, mockRenderOgCard } = vi.hoisted(() => ({
  mockGetVisibleStoryBySlug: vi.fn(),
  mockImageResponse: vi.fn().mockImplementation(function (this: unknown, element: unknown) {
    Object.assign(this as object, { element });
  }),
  mockRenderOgCard: vi.fn().mockReturnValue("rendered-card"),
}));

vi.mock("@/lib/stories", () => ({ getVisibleStoryBySlug: mockGetVisibleStoryBySlug }));
vi.mock("next/og", () => ({ ImageResponse: mockImageResponse }));
vi.mock("@/lib/og-card", () => ({
  renderOgCard: mockRenderOgCard,
  clampBody: (text: string) => text,
  OG_SIZE: { width: 1200, height: 630 },
  OG_CONTENT_TYPE: "image/png",
}));

describe("Story opengraph-image", () => {
  beforeEach(() => {
    mockGetVisibleStoryBySlug.mockReset();
    mockImageResponse.mockClear();
    mockRenderOgCard.mockClear();
  });

  // getVisibleStoryBySlug (not the raw catalog) returns undefined for a
  // flagged slug — this route must render the generic fallback card instead
  // of exposing the story it was told to hide, and must not be prerendered/
  // cached (see the `dynamic = "force-dynamic"` export) or a stale cached
  // image could keep serving it anyway.
  it("renders the fallback card for a flagged or unknown slug", async () => {
    mockGetVisibleStoryBySlug.mockResolvedValue(undefined);
    const { default: Image, dynamic } = await import("@/app/stories/[slug]/opengraph-image");
    expect(dynamic).toBe("force-dynamic");

    await Image({ params: Promise.resolve({ slug: "flagged-story" }) });

    expect(mockRenderOgCard).toHaveBeenCalledWith(
      expect.objectContaining({ eyebrow: "Open Hikmah" })
    );
    expect(mockRenderOgCard).not.toHaveBeenCalledWith(
      expect.objectContaining({ eyebrow: "Prophetic Stories" })
    );
  });

  it("renders the story card for a visible slug", async () => {
    mockGetVisibleStoryBySlug.mockResolvedValue({
      name: { en: "Test Story" },
      tagline: { en: "A tagline" },
    });
    const { default: Image } = await import("@/app/stories/[slug]/opengraph-image");

    await Image({ params: Promise.resolve({ slug: "test-story" }) });

    expect(mockRenderOgCard).toHaveBeenCalledWith(
      expect.objectContaining({ eyebrow: "Prophetic Stories", title: "Test Story" })
    );
  });
});
