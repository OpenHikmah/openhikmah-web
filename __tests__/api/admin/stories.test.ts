import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: vi.fn(),
  rateLimitAdminMutation: vi.fn(() => null),
}));
vi.mock("@/lib/admin/admin-audit", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/stories/story-flags", () => ({
  getAllFlags: vi.fn(() => Promise.resolve([])),
  flagStory: vi.fn(() => Promise.resolve()),
  unflagStory: vi.fn(() => Promise.resolve()),
}));

import { GET, PATCH } from "@/app/api/admin/stories/route";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { getAllFlags, flagStory, unflagStory } from "@/lib/stories/story-flags";
import { STORIES } from "@/lib/stories";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };
const realSlug = STORIES[0].slug;

function get() {
  return new NextRequest("http://localhost/api/admin/stories", {
    headers: { Authorization: "Bearer t" },
  });
}
function patch(body: unknown) {
  return new NextRequest("http://localhost/api/admin/stories", {
    method: "PATCH",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  vi.mocked(getAllFlags).mockResolvedValue([]);
  vi.mocked(logAdminAction).mockClear();
  vi.mocked(flagStory).mockClear();
  vi.mocked(unflagStory).mockClear();
});

describe("GET /api/admin/stories", () => {
  it("returns the guard's own response for a non-admin caller", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(get());
    expect(res.status).toBe(404);
  });

  it("lists every story as visible when there are no flags", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stories).toHaveLength(STORIES.length);
    expect(body.stories.every((s: { hidden: boolean }) => s.hidden === false)).toBe(true);
  });

  it("marks a flagged slug hidden with its reason", async () => {
    vi.mocked(getAllFlags).mockResolvedValue([
      {
        slug: realSlug,
        reason: "wrong translation",
        flaggedBy: "qf-admin",
        flaggedAt: new Date("2026-01-01"),
      },
    ]);
    const res = await GET(get());
    const body = await res.json();
    const flagged = body.stories.find((s: { slug: string }) => s.slug === realSlug);
    expect(flagged.hidden).toBe(true);
    expect(flagged.reason).toBe("wrong translation");
  });
});

describe("PATCH /api/admin/stories", () => {
  it("returns 400 for a malformed body", async () => {
    const req = new NextRequest("http://localhost/api/admin/stories", {
      method: "PATCH",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: "not-json",
    });
    expect((await PATCH(req)).status).toBe(400);
  });

  it("returns 400 for a missing slug", async () => {
    const res = await PATCH(patch({ hidden: true }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when hidden is not specified", async () => {
    const res = await PATCH(patch({ slug: realSlug }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown story slug", async () => {
    const res = await PATCH(patch({ slug: "not-a-real-prophet", hidden: true }));
    expect(res.status).toBe(400);
  });

  it("flags a story and logs the action", async () => {
    const res = await PATCH(patch({ slug: realSlug, hidden: true, reason: "needs review" }));
    expect(res.status).toBe(200);
    expect(flagStory).toHaveBeenCalledWith(realSlug, "needs review", "qf-admin");
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "story.flag", targetId: realSlug })
    );
  });

  it("restores a story and logs the action", async () => {
    const res = await PATCH(patch({ slug: realSlug, hidden: false }));
    expect(res.status).toBe(200);
    expect(unflagStory).toHaveBeenCalledWith(realSlug);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "story.unflag", targetId: realSlug })
    );
  });
});
