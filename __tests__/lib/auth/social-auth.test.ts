import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync, sign as cryptoSign, type KeyObject } from "node:crypto";
import { NextRequest } from "next/server";

// ─── DB mock — requireUser does db.select().from().where().limit() ────────────
const { mockLimit, mockSelect, mockRedisGet, mockRedisSet } = vi.hoisted(() => {
  const mockLimit = vi.fn();
  const mockWhere = vi.fn(() => ({ limit: mockLimit }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  // Default: L2 cache miss → existing tests exercise the JWT/userinfo path.
  const mockRedisGet = vi.fn().mockResolvedValue(null);
  const mockRedisSet = vi.fn().mockResolvedValue(undefined);
  return { mockLimit, mockSelect, mockRedisGet, mockRedisSet };
});
vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect } }));
vi.mock("@/lib/infra/redis", () => ({
  redisGet: mockRedisGet,
  redisSet: mockRedisSet,
  redisDel: vi.fn(),
  redisPublish: vi.fn(),
  redisSubscribe: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { requireUser, resolveQfId, tokenCache } from "@/lib/auth/social-auth";

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

function makeJwt(
  payload: object,
  opts: { kid?: string; alg?: string; sign?: boolean } = {}
): string {
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
  mockRedisGet.mockReset();
  mockRedisGet.mockResolvedValue(null); // default: L2 miss
  mockRedisSet.mockClear();
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

  it("rejects a validly-signed token whose payload omits exp entirely (fails closed)", async () => {
    mockLimit.mockResolvedValue([user]); // even if a row existed, we must not reach it
    const token = makeJwt({ sub: "qf-sub-123" });
    const res = await requireUser(reqWith(token));
    expect("status" in res && (res as Response).status).toBe(401);
  });

  it("rejects a validly-signed token whose exp is non-numeric (fails closed)", async () => {
    mockLimit.mockResolvedValue([user]);
    const token = makeJwt({ sub: "qf-sub-123", exp: "not-a-number" });
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
      if (String(url).includes("userinfo"))
        return { ok: true, json: async () => ({ sub: "qf-sub-123" }) };
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

describe("requireUser — Redis L2 token cache", () => {
  it("L2 hit resolves the user by id without any JWT/userinfo round-trip", async () => {
    mockRedisGet.mockResolvedValue("7"); // token→userId cached in Redis
    mockLimit.mockResolvedValue([user]);
    // Opaque token + userinfo unreachable: if we reached the network path this
    // would 401, so a 7 here proves the L2 cache short-circuited it.
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const res = await requireUser(reqWith("opaque-token-no-dots"));
    expect("userId" in res && res.userId).toBe(7);
  });

  it("L2 value that isn't an integer falls through (401 when nothing else resolves)", async () => {
    mockRedisGet.mockResolvedValue("garbage");
    mockLimit.mockResolvedValue([user]);
    mockFetch.mockResolvedValue({ ok: false, status: 404 }); // userinfo unreachable
    const res = await requireUser(reqWith("opaque-token-no-dots"));
    expect("status" in res && (res as Response).status).toBe(401);
  });

  it("L2 id that no longer exists falls through to the JWT path", async () => {
    mockRedisGet.mockResolvedValue("999"); // stale id
    // First select (L2 lookup by id 999) → empty; second (JWT qfId) → the user.
    mockLimit.mockResolvedValueOnce([]).mockResolvedValue([user]);
    const token = makeJwt({ sub: "qf-sub-123", exp: farFuture });
    const res = await requireUser(reqWith(token));
    expect("userId" in res && res.userId).toBe(7);
  });

  it("populates the L2 cache on a miss (write-back) so the next request hits it", async () => {
    mockLimit.mockResolvedValue([user]); // resolved via the JWT path (L2 miss)
    const token = makeJwt({ sub: "qf-sub-123", exp: farFuture });
    await requireUser(reqWith(token));
    // token→id written to Redis under the hashed key for next time.
    expect(mockRedisSet).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:tok:/),
      "7",
      expect.any(Number)
    );
  });
});

describe("requireUser — dev/test login bypass", () => {
  const devUser = { id: 42, qfId: "dev-admin", username: "devadmin", disabledAt: null } as never;

  afterEach(() => {
    delete process.env.DEV_AUTH_TOKEN;
    delete process.env.DEV_AUTH_QF_ID;
    vi.unstubAllEnvs();
  });

  it("is inert when DEV_AUTH_* env is not set (the magic token gets normal handling)", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 }); // userinfo unreachable
    const res = await requireUser(reqWith("dev-secret"));
    expect("status" in res && (res as Response).status).toBe(401);
  });

  it("resolves the fixed dev user when configured and the token matches", async () => {
    process.env.DEV_AUTH_TOKEN = "dev-secret";
    process.env.DEV_AUTH_QF_ID = "dev-admin";
    mockLimit.mockResolvedValue([devUser]);
    const res = await requireUser(reqWith("dev-secret"));
    expect("userId" in res && res.userId).toBe(42);
  });

  it("ignores a non-matching token even when configured", async () => {
    process.env.DEV_AUTH_TOKEN = "dev-secret";
    process.env.DEV_AUTH_QF_ID = "dev-admin";
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const res = await requireUser(reqWith("wrong-token"));
    expect("status" in res && (res as Response).status).toBe(401);
  });

  it("is hard-disabled under NODE_ENV=production (no override)", async () => {
    process.env.DEV_AUTH_TOKEN = "dev-secret";
    process.env.DEV_AUTH_QF_ID = "dev-admin";
    vi.stubEnv("NODE_ENV", "production");
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const res = await requireUser(reqWith("dev-secret"));
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
      if (String(url).includes("userinfo"))
        return { ok: true, json: async () => ({ sub: "from-userinfo" }) };
      return { ok: false, status: 404 };
    });
    expect(await resolveQfId(makeJwt({ sub: "forged" }, { sign: false }))).toBe("from-userinfo");
  });
});
