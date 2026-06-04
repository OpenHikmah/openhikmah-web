import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateKeyPairSync,
  sign as cryptoSign,
  type KeyObject,
} from "node:crypto";
import { NextRequest } from "next/server";

// ─── DB mock — requireUser does db.select().from().where().limit() ────────────
const { mockLimit, mockSelect } = vi.hoisted(() => {
  const mockLimit = vi.fn();
  const mockWhere = vi.fn(() => ({ limit: mockLimit }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  return { mockLimit, mockSelect };
});
vi.mock("@/lib/db", () => ({ db: { select: mockSelect } }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { requireUser, resolveQfId, tokenCache } from "@/lib/social-auth";

// ─── Test signing key (stands in for QF's Hydra signing key) ──────────────────
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-key-1";

function jwks() {
  const jwk = (publicKey as KeyObject).export({ format: "jwk" }) as Record<string, string>;
  return { keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] };
}

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function makeJwt(payload: object, opts: { kid?: string; alg?: string; sign?: boolean } = {}): string {
  const header = { alg: opts.alg ?? "RS256", typ: "JWT", kid: opts.kid ?? KID };
  const body = `${b64url(header)}.${b64url(payload)}`;
  if (opts.sign === false) return `${body}.not-a-real-signature`;
  const sig = cryptoSign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url");
  return `${body}.${sig}`;
}

const farFuture = Math.floor(Date.now() / 1000) + 3600;
const user = { id: 7, qfId: "qf-sub-123", username: "amina" } as never;

function reqWith(token: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest("http://localhost/api/social/me", { headers });
}

beforeEach(() => {
  mockLimit.mockReset();
  mockFetch.mockReset();
  mockSelect.mockClear();
  tokenCache.clear();
  process.env.QF_AUTH_BASE = "https://auth.example.test";
  // Default: JWKS endpoint returns our test key; userinfo is unreachable.
  mockFetch.mockImplementation(async (url: string) => {
    if (String(url).includes("jwks")) return { ok: true, json: async () => jwks() };
    return { ok: false, status: 401 };
  });
});

describe("requireUser — JWT signature verification", () => {
  it("authenticates a token with a valid signature", async () => {
    mockLimit.mockResolvedValue([user]);
    const token = makeJwt({ sub: "qf-sub-123", exp: farFuture });
    const res = await requireUser(reqWith(token));
    expect("userId" in res && res.userId).toBe(7);
  });

  it("rejects a token whose signature does not verify (tampered)", async () => {
    mockLimit.mockResolvedValue([user]); // even if a row existed, we must not reach it
    const token = makeJwt({ sub: "qf-sub-123", exp: farFuture }, { sign: false });
    const res = await requireUser(reqWith(token));
    expect("status" in res && (res as Response).status).toBe(401);
  });

  it("rejects an expired token", async () => {
    mockLimit.mockResolvedValue([user]);
    const token = makeJwt({ sub: "qf-sub-123", exp: Math.floor(Date.now() / 1000) - 10 });
    const res = await requireUser(reqWith(token));
    expect("status" in res && (res as Response).status).toBe(401);
  });

  it("rejects the alg=none bypass", async () => {
    mockLimit.mockResolvedValue([user]);
    const token = makeJwt({ sub: "qf-sub-123", exp: farFuture }, { alg: "none", sign: false });
    const res = await requireUser(reqWith(token));
    expect("status" in res && (res as Response).status).toBe(401);
  });

  it("falls back to the userinfo path for an opaque (non-JWT) token", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("userinfo")) return { ok: true, json: async () => ({ sub: "qf-sub-123" }) };
      return { ok: false, status: 404 };
    });
    mockLimit.mockResolvedValue([user]);
    const res = await requireUser(reqWith("opaque-token-no-dots"));
    expect("userId" in res && res.userId).toBe(7);
  });

  it("returns 401 when no token is supplied", async () => {
    const res = await requireUser(reqWith(null));
    expect("status" in res && (res as Response).status).toBe(401);
  });
});

describe("resolveQfId", () => {
  it("returns the sub from a validly signed JWT", async () => {
    expect(await resolveQfId(makeJwt({ sub: "qf-sub-999", exp: farFuture }))).toBe("qf-sub-999");
  });

  it("does not trust an unsigned JWT, falling back to userinfo", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("jwks")) return { ok: true, json: async () => jwks() };
      if (String(url).includes("userinfo")) return { ok: true, json: async () => ({ sub: "from-userinfo" }) };
      return { ok: false, status: 404 };
    });
    expect(await resolveQfId(makeJwt({ sub: "forged" }, { sign: false }))).toBe("from-userinfo");
  });
});
