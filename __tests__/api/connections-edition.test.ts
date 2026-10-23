import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetConnections } = vi.hoisted(() => ({
  mockGetConnections: vi.fn(async () => []),
}));

vi.mock("@/lib/ai/graph-service", () => ({ getConnections: mockGetConnections }));
vi.mock("@/lib/i18n/request-prefs", () => ({
  getUiLocale: async () => "az",
  getQuranEdition: async () => "az.mammadaliyev",
}));

import { POST } from "@/app/api/connections/route";

describe("POST /api/connections — reader preferences", () => {
  it.each(["thematic", "root", "contrast"])(
    "passes the reader's Quran edition alongside the locale for %s",
    async (kind) => {
      const req = new NextRequest("http://localhost/api/connections", {
        method: "POST",
        body: JSON.stringify({ fromRef: "112:1", kind }),
      });

      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(mockGetConnections).toHaveBeenCalledWith(
        "112:1",
        kind,
        expect.any(Function),
        expect.objectContaining({ locale: "az", edition: "az.mammadaliyev" })
      );
    }
  );
});
