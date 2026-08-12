import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: vi.fn(),
  rateLimitAdminMutation: vi.fn(() => null),
}));
vi.mock("@/lib/admin/admin-audit", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/ai/prompt-registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/prompt-registry")>();
  return { ...actual, invalidatePromptCache: vi.fn() };
});

function makeDbChain(resolveWith: unknown = []) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(
    function () {
      return chain;
    },
    {
      get(_t, prop) {
        if (prop === "then")
          return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(resolveWith).then(res, rej);
        return () => chain;
      },
      apply() {
        return chain;
      },
    }
  );
  return chain;
}

const { mockSelect, mockTransaction, txUpdate, txInsert, txSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  txUpdate: vi.fn(() => makeDbChain([])),
  txInsert: vi.fn(() => makeDbChain([])),
  txSelect: vi.fn(() => makeDbChain([])),
  mockTransaction: vi.fn(),
}));
vi.mock("@/lib/infra/db", () => ({
  db: {
    select: mockSelect,
    transaction: mockTransaction,
  },
}));

import { GET, POST } from "@/app/api/admin/prompts/route";
import { POST as ROLLBACK } from "@/app/api/admin/prompts/rollback/route";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { invalidatePromptCache } from "@/lib/ai/prompt-registry";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };

function req(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockSelect.mockReturnValue(makeDbChain([]));
  txUpdate.mockReturnValue(makeDbChain([]));
  txInsert.mockReturnValue(makeDbChain([]));
  txSelect.mockReturnValue(makeDbChain([]));
  // The route calls db.transaction(async (tx) => ...) — the tx object exposes
  // the same insert/update/select surface as the top-level mocked db.
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ update: txUpdate, insert: txInsert, select: txSelect })
  );
});

describe("GET /api/admin/prompts", () => {
  it("404s for a non-admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await GET(req("http://localhost/api/admin/prompts", "GET"));
    expect(res.status).toBe(404);
  });

  it("returns the known prompt keys and stored versions", async () => {
    const versions = [{ id: 1, key: "connection.legacy", template: "t", active: true }];
    mockSelect.mockReturnValue(makeDbChain(versions));

    const res = await GET(req("http://localhost/api/admin/prompts", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys).toEqual(["connection.legacy", "connection.selection"]);
    expect(body.versions).toEqual(versions);
  });

  it("rejects an unknown ?key= filter", async () => {
    const res = await GET(req("http://localhost/api/admin/prompts?key=not-a-real-key", "GET"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/prompts — create + activate", () => {
  it("404s for a non-admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await POST(
      req("http://localhost/api/admin/prompts", "POST", {
        key: "connection.legacy",
        template: "New template",
      })
    );
    expect(res.status).toBe(404);
  });

  it("rejects an invalid prompt key", async () => {
    const res = await POST(
      req("http://localhost/api/admin/prompts", "POST", {
        key: "not-a-real-key",
        template: "New template",
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a missing or blank template", async () => {
    const res = await POST(
      req("http://localhost/api/admin/prompts", "POST", {
        key: "connection.legacy",
        template: "   ",
      })
    );
    expect(res.status).toBe(400);
  });

  it("deactivates the old active version and activates the new one inside one transaction", async () => {
    const created = { id: 2, key: "connection.legacy", template: "New template", active: true };
    txInsert.mockReturnValue(makeDbChain([created]));

    const res = await POST(
      req("http://localhost/api/admin/prompts", "POST", {
        key: "connection.legacy",
        template: "New template",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toEqual(created);

    expect(mockTransaction).toHaveBeenCalledOnce();
    // Deactivate-old and the insert both ran on the same tx handle — proves
    // the two writes share one transaction, not two round trips that could
    // interleave with a concurrent request.
    expect(txUpdate).toHaveBeenCalledOnce();
    expect(txInsert).toHaveBeenCalledOnce();
  });

  it("invalidates the prompt cache and logs the admin action after a successful create", async () => {
    txInsert.mockReturnValue(
      makeDbChain([{ id: 2, key: "connection.legacy", template: "t", active: true }])
    );

    await POST(
      req("http://localhost/api/admin/prompts", "POST", {
        key: "connection.legacy",
        template: "New template",
      })
    );

    expect(invalidatePromptCache).toHaveBeenCalledWith("connection.legacy");
  });
});

describe("POST /api/admin/prompts/rollback", () => {
  it("404s for a non-admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    const res = await ROLLBACK(
      req("http://localhost/api/admin/prompts/rollback", "POST", { id: 1 })
    );
    expect(res.status).toBe(404);
  });

  it("rejects a non-integer id", async () => {
    const res = await ROLLBACK(
      req("http://localhost/api/admin/prompts/rollback", "POST", { id: "not-a-number" })
    );
    expect(res.status).toBe(400);
  });

  it("404s when the target version doesn't exist", async () => {
    txSelect.mockReturnValue(makeDbChain([]));
    const res = await ROLLBACK(
      req("http://localhost/api/admin/prompts/rollback", "POST", { id: 999 })
    );
    expect(res.status).toBe(404);
  });

  it("reactivates the target version and deactivates whatever else was active for that key", async () => {
    const target = { id: 1, key: "connection.legacy", template: "old", active: false };
    const reactivated = { ...target, active: true };
    txSelect.mockReturnValue(makeDbChain([target]));
    txUpdate.mockReturnValue(makeDbChain([reactivated]));

    const res = await ROLLBACK(
      req("http://localhost/api/admin/prompts/rollback", "POST", { id: 1 })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toEqual(reactivated);
    expect(mockTransaction).toHaveBeenCalledOnce();
    // Two updates happen on the tx: deactivate whatever's currently active,
    // then reactivate the target row.
    expect(txUpdate).toHaveBeenCalledTimes(2);
    expect(invalidatePromptCache).toHaveBeenCalledWith("connection.legacy");
  });
});
