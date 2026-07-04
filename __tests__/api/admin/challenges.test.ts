import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/db/schema";

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin-audit", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/challenges", () => ({
  scoreChallenge: vi.fn(async () => 0),
  pickWinner: vi.fn(() => 1),
  resolveEndedChallenges: vi.fn(
    async () => new Map([[1, { challengerScore: 1, challengedScore: 0 }]])
  ),
  resolveExpiredPending: vi.fn(async () => 0),
}));

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

const { mockSelect, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockSelect: vi.fn(() => makeDbChain([])),
  mockUpdate: vi.fn(() => makeDbChain([])),
  mockDelete: vi.fn(() => makeDbChain([])),
}));
vi.mock("@/lib/db", () => ({ db: { select: mockSelect, update: mockUpdate, delete: mockDelete } }));

import { PATCH, DELETE } from "@/app/api/admin/challenges/[id]/route";
import { POST as FINALIZE } from "@/app/api/admin/challenges/finalize/route";
import { requireAdmin } from "@/lib/admin-auth";

const admin = { userId: 1, user: { qfId: "qf-admin" } as User };
const challenge = { id: 1, challengerId: 1, challengedId: 2, status: "active", endsAt: new Date() };

function req(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/admin/challenges/1", {
    method,
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: "1" }) };

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue(admin);
  mockSelect.mockReturnValue(makeDbChain([challenge]));
  mockUpdate.mockReturnValue(makeDbChain([{ ...challenge, status: "completed" }]));
  mockDelete.mockReturnValue(makeDbChain([challenge]));
});

describe("admin challenges [id]", () => {
  it("404s for a non-admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );
    expect((await PATCH(req("PATCH", { action: "end" }), params)).status).toBe(404);
  });

  it("ends an active challenge", async () => {
    const res = await PATCH(req("PATCH", { action: "end" }), params);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("rejects ending a non-active challenge", async () => {
    mockSelect.mockReturnValue(makeDbChain([{ ...challenge, status: "completed" }]));
    expect((await PATCH(req("PATCH", { action: "end" }), params)).status).toBe(409);
  });

  it("rejects override-winner with a non-participant id", async () => {
    expect(
      (await PATCH(req("PATCH", { action: "override-winner", winnerId: 999 }), params)).status
    ).toBe(400);
  });

  it("accepts override-winner with null (draw)", async () => {
    const res = await PATCH(req("PATCH", { action: "override-winner", winnerId: null }), params);
    expect(res.status).toBe(200);
  });

  it("rejects an unknown action", async () => {
    expect((await PATCH(req("PATCH", { action: "nope" }), params)).status).toBe(400);
  });

  it("409s when a concurrent request already ended the challenge before this update lands", async () => {
    mockUpdate.mockReturnValue(makeDbChain([])); // scoped update matched nothing (status changed underneath us)
    expect((await PATCH(req("PATCH", { action: "end" }), params)).status).toBe(409);
  });

  it("voids a challenge (204)", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(204);
  });

  it("404s voiding a missing challenge", async () => {
    mockDelete.mockReturnValue(makeDbChain([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });
});

describe("admin challenges finalize", () => {
  it("returns the resolved count", async () => {
    mockSelect.mockReturnValue(makeDbChain([challenge]));
    const res = await FINALIZE(
      new NextRequest("http://localhost/api/admin/challenges/finalize", {
        method: "POST",
        headers: { Authorization: "Bearer t" },
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).resolved).toBe(1);
  });
});
