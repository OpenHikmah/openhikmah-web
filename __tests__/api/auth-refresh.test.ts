import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";

// A shared in-memory stand-in for the Redis helpers, so two logical "instances"
// (both driving the one POST handler) see the same result cache + lock. Default
// redisEnabled() is false — every test above runs the unchanged per-process path.
const { redisStore, mockRedis } = vi.hoisted(() => {
  const redisStore = new Map<string, string>();
  return {
    redisStore,
    mockRedis: {
      redisEnabled: vi.fn(() => false),
      redisGet: vi.fn(async (k: string) => redisStore.get(k) ?? null),
      redisSet: vi.fn(async (k: string, v: string): Promise<boolean> => {
        redisStore.set(k, v);
        return true;
      }),
      redisDelIfEqual: vi.fn(async (k: string, expected: string) => {
        if (redisStore.get(k) === expected) redisStore.delete(k);
      }),
      redisSetNx: vi.fn(async (k: string, v: string): Promise<boolean | null> => {
        if (redisStore.has(k)) return false;
        redisStore.set(k, v);
        return true;
      }),
    },
  };
});
vi.mock("@/lib/infra/redis", () => mockRedis);

import { POST } from "@/app/api/auth/refresh/route";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const resultKey = (token: string) => `auth:refresh:${sha(token)}`;
const lockKey = (token: string) => `${resultKey(token)}:lock`;

function makeReq(refreshToken?: string) {
  return new NextRequest("http://localhost/api/auth/refresh", {
    method: "POST",
    headers: refreshToken ? { Cookie: `qf_refresh_token=${refreshToken}` } : {},
  });
}

describe("POST /api/auth/refresh", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns 401 when there is no refresh cookie", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/no session/i);
  });

  it("clears a stale qf_has_session marker when there is no refresh cookie", async () => {
    const req = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: "qf_has_session=1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith("qf_has_session=;"))).toBe(true);
  });

  it("returns 200 with a new access token and rotates the cookie", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "access-1", refresh_token: "refresh-rotated-1" }),
    });

    const res = await POST(makeReq("refresh-old-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBe("access-1");
    const setCookies = res.headers.getSetCookie();
    const refreshCookie = setCookies.find((c) => c.startsWith("qf_refresh_token=")) ?? "";
    expect(refreshCookie).toContain("qf_refresh_token=refresh-rotated-1");
    expect(refreshCookie.toLowerCase()).toContain("httponly");
    const hasSessionCookie = setCookies.find((c) => c.startsWith("qf_has_session=")) ?? "";
    expect(hasSessionCookie).toContain("qf_has_session=1");
    expect(hasSessionCookie.toLowerCase()).not.toContain("httponly");
  });

  it("re-stamps the same refresh token when the provider doesn't rotate", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "access-2" }),
    });

    const res = await POST(makeReq("refresh-same-2"));
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("qf_refresh_token=refresh-same-2");
  });

  it("returns 401 and clears the cookie on invalid_grant", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "invalid_grant" }),
    });

    const res = await POST(makeReq("refresh-invalid-3"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/session expired/i);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith("qf_refresh_token=;"))).toBe(true);
    expect(setCookies.some((c) => c.startsWith("qf_has_session=;"))).toBe(true);
  });

  it("returns 503 and keeps the cookie on a transient upstream failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const res = await POST(makeReq("refresh-transient-4"));
    expect(res.status).toBe(503);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns 503 for a non-invalid_grant error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "server_error" }),
    });

    const res = await POST(makeReq("refresh-servererr-5"));
    expect(res.status).toBe(503);
  });

  it("does not cache a transient failure, so a retry hits the token endpoint again", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const first = await POST(makeReq("refresh-retry-6"));
    expect(first.status).toBe(503);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "access-6", refresh_token: "refresh-rotated-6" }),
    });
    const second = await POST(makeReq("refresh-retry-6"));
    expect(second.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent requests for the same token into a single upstream call", async () => {
    let resolveFetch!: (value: unknown) => void;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const p1 = POST(makeReq("refresh-concurrent-7"));
    const p2 = POST(makeReq("refresh-concurrent-7"));

    resolveFetch({
      ok: true,
      json: async () => ({ access_token: "access-7", refresh_token: "refresh-rotated-7" }),
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it("serves a just-completed result to a request arriving right after, without a second upstream call", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "access-8", refresh_token: "refresh-rotated-8" }),
    });

    const first = await POST(makeReq("refresh-cached-8"));
    expect(first.status).toBe(200);

    const second = await POST(makeReq("refresh-cached-8"));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.accessToken).toBe("access-8");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("hits the token endpoint again once the cached result's TTL has expired", async () => {
    vi.useFakeTimers();
    try {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "access-9", refresh_token: "refresh-rotated-9" }),
      });
      const first = await POST(makeReq("refresh-ttl-9"));
      expect(first.status).toBe(200);

      // Just under the 30s TTL: still served from cache, no second call.
      vi.advanceTimersByTime(29_000);
      const stillCached = await POST(makeReq("refresh-ttl-9"));
      expect(stillCached.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Past the TTL: cache entry is swept, so the token is re-sent upstream.
      vi.advanceTimersByTime(2_000);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "access-9b", refresh_token: "refresh-rotated-9b" }),
      });
      const afterExpiry = await POST(makeReq("refresh-ttl-9"));
      expect(afterExpiry.status).toBe(200);
      const afterExpiryBody = await afterExpiry.json();
      expect(afterExpiryBody.accessToken).toBe("access-9b");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("POST /api/auth/refresh — Redis-coordinated (multi-instance)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    redisStore.clear();
    mockRedis.redisEnabled.mockReturnValue(true);
    mockRedis.redisGet.mockClear();
    mockRedis.redisSet.mockClear();
    mockRedis.redisDelIfEqual.mockClear();
    mockRedis.redisSetNx.mockClear();
    mockRedis.redisSetNx.mockImplementation(async (k: string, v: string) => {
      if (redisStore.has(k)) return false;
      redisStore.set(k, v);
      return true;
    });
    mockRedis.redisGet.mockImplementation(async (k: string) => redisStore.get(k) ?? null);
    mockRedis.redisSet.mockImplementation(async (k: string, v: string) => {
      redisStore.set(k, v);
      return true;
    });
    mockRedis.redisDelIfEqual.mockImplementation(async (k: string, expected: string) => {
      if (redisStore.get(k) === expected) redisStore.delete(k);
    });
  });
  afterAll(() => mockRedis.redisEnabled.mockReturnValue(false));

  it("replays a result a peer instance already cached, with no upstream call", async () => {
    redisStore.set(
      resultKey("tok-peer-cached"),
      JSON.stringify({ kind: "ok", accessToken: "acc-peer", refreshToken: "ref-peer" })
    );

    const res = await POST(makeReq("tok-peer-cached"));

    expect(res.status).toBe(200);
    expect((await res.json()).accessToken).toBe("acc-peer");
    expect(res.headers.get("set-cookie")).toContain("qf_refresh_token=ref-peer");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("leads the refresh, publishes the outcome for peers, and releases the lock", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "acc-lead", refresh_token: "ref-lead" }),
    });

    const res = await POST(makeReq("tok-lead"));

    expect(res.status).toBe(200);
    expect(mockRedis.redisSetNx).toHaveBeenCalledWith(lockKey("tok-lead"), expect.any(String), 10);
    expect(JSON.parse(redisStore.get(resultKey("tok-lead"))!)).toMatchObject({
      kind: "ok",
      accessToken: "acc-lead",
      refreshToken: "ref-lead",
    });
    expect(redisStore.has(lockKey("tok-lead"))).toBe(false); // lock released
  });

  it("waits for the peer's result instead of presenting the token when the lock is held", async () => {
    vi.useFakeTimers();
    try {
      redisStore.set(lockKey("tok-wait"), "peer-nonce"); // a peer holds the lock

      const pending = POST(makeReq("tok-wait"));
      await vi.advanceTimersByTimeAsync(1); // caller takes the failed lock, enters the poll
      // The winner publishes its result while we're polling.
      redisStore.set(
        resultKey("tok-wait"),
        JSON.stringify({ kind: "ok", accessToken: "acc-win", refreshToken: "ref-win" })
      );
      await vi.advanceTimersByTimeAsync(300);
      const res = await pending;

      expect(res.status).toBe(200);
      expect((await res.json()).accessToken).toBe("acc-win");
      expect(mockFetch).not.toHaveBeenCalled(); // never presented the token ourselves
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a retryable 503 (cookie kept) when the lock is held and no result appears", async () => {
    vi.useFakeTimers();
    try {
      redisStore.set(lockKey("tok-timeout"), "peer-nonce");

      const pending = POST(makeReq("tok-timeout"));
      await vi.advanceTimersByTimeAsync(6_000); // past POLL_TIMEOUT_MS, lock never clears
      const res = await pending;

      expect(res.status).toBe(503);
      expect(res.headers.get("set-cookie")).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to a direct upstream call when the distributed lock is unavailable", async () => {
    mockRedis.redisSetNx.mockResolvedValue(null); // Redis unreachable for the lock
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "acc-fb", refresh_token: "ref-fb" }),
    });

    const res = await POST(makeReq("tok-fallback"));

    expect(res.status).toBe(200);
    expect((await res.json()).accessToken).toBe("acc-fb");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("replays a peer's cached invalid_grant across instances — 401, both cookies cleared, no upstream call", async () => {
    redisStore.set(resultKey("tok-peer-invalid"), JSON.stringify({ kind: "invalid" }));

    const res = await POST(makeReq("tok-peer-invalid"));

    expect(res.status).toBe(401);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith("qf_refresh_token=;"))).toBe(true);
    expect(setCookies.some((c) => c.startsWith("qf_has_session=;"))).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("ignores a malformed shared entry and leads a fresh refresh", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    redisStore.set(
      resultKey("tok-malformed"),
      JSON.stringify({ kind: "ok", accessToken: "x" }) // missing refreshToken
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "acc-fresh", refresh_token: "ref-fresh" }),
    });

    const res = await POST(makeReq("tok-malformed"));

    expect(res.status).toBe(200);
    expect((await res.json()).accessToken).toBe("acc-fresh");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("unrecognized shared outcome"));
    errSpy.mockRestore();
  });

  it("coalesces two concurrent same-token requests into one lock + one upstream call", async () => {
    let resolveFetch!: (value: unknown) => void;
    mockFetch.mockImplementationOnce(() => new Promise((resolve) => (resolveFetch = resolve)));

    const p1 = POST(makeReq("tok-coalesce"));
    const p2 = POST(makeReq("tok-coalesce"));
    await new Promise((r) => setTimeout(r, 0)); // let the leader reach the upstream call
    resolveFetch({
      ok: true,
      json: async () => ({ access_token: "acc-co", refresh_token: "ref-co" }),
    });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockRedis.redisSetNx).toHaveBeenCalledTimes(1);
  });

  it("keeps the lock (does not release) when publishing the result fails", async () => {
    mockRedis.redisSet.mockResolvedValue(false); // publish dropped
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "acc-np", refresh_token: "ref-np" }),
    });

    const res = await POST(makeReq("tok-nopublish"));

    expect(res.status).toBe(200); // the leader still returns its own outcome
    expect(mockRedis.redisDelIfEqual).not.toHaveBeenCalledWith(
      lockKey("tok-nopublish"),
      expect.anything()
    );
    expect(redisStore.has(lockKey("tok-nopublish"))).toBe(true); // lock held to TTL
  });

  it("does not delete a lock a successor took while it was publishing (compare-and-delete)", async () => {
    mockRedis.redisSet.mockImplementation(async (k: string, v: string) => {
      redisStore.set(k, v);
      // Our lease expired mid-publish and a peer grabbed a fresh lock.
      redisStore.set(lockKey("tok-cad"), "successor-nonce");
      return true;
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "a", refresh_token: "r" }),
    });

    await POST(makeReq("tok-cad"));

    expect(redisStore.get(lockKey("tok-cad"))).toBe("successor-nonce"); // ours, not deleted
  });

  it("a waiter stops early (retryable 503) once the leader releases the lock with no result", async () => {
    vi.useFakeTimers();
    try {
      redisStore.set(lockKey("tok-early"), "peer-nonce");
      const pending = POST(makeReq("tok-early"));
      await vi.advanceTimersByTimeAsync(1); // caller takes the failed lock, enters the poll
      // Peer finished with a transient outcome: lock gone, no result published.
      redisStore.delete(lockKey("tok-early"));
      await vi.advanceTimersByTimeAsync(300); // one poll interval, not the full 5s
      const res = await pending;

      expect(res.status).toBe(503);
      expect(res.headers.get("set-cookie")).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
