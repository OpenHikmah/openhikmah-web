import { describe, it, expect, vi, beforeEach } from "vitest";
import { authFetch } from "@/lib/auth/auth-fetch";
import { useAuthStore } from "@/store/auth";

function res(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bearer(init?: RequestInit) {
  return new Headers(init?.headers).get("Authorization");
}

function mockServer(opts: { refresh: () => Promise<Response> | Response; validToken: string }) {
  return vi.spyOn(global, "fetch").mockImplementation((input, init) => {
    if (String(input) === "/api/auth/refresh") return Promise.resolve(opts.refresh());
    return Promise.resolve(
      bearer(init) === `Bearer ${opts.validToken}` ? res(200, { ok: true }) : res(401)
    );
  });
}

const refreshCalls = (spy: ReturnType<typeof mockServer>) =>
  spy.mock.calls.filter(([u]) => String(u) === "/api/auth/refresh");

beforeEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ accessToken: "stale", bookmarks: [], pendingBookmarkAdds: [] });
});

describe("authFetch", () => {
  it("sends the current access token and passes a non-401 response through untouched", async () => {
    const spy = mockServer({ refresh: () => res(500), validToken: "stale" });
    const r = await authFetch("/api/notes", { method: "POST", body: "{}" });
    expect(r.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(bearer(spy.mock.calls[0][1])).toBe("Bearer stale");
    expect(spy.mock.calls[0][1]?.method).toBe("POST");
  });

  it("overrides a caller-supplied Authorization header with the store token", async () => {
    const spy = mockServer({ refresh: () => res(500), validToken: "stale" });
    await authFetch("/api/notes", { headers: { Authorization: "Bearer other", "X-A": "1" } });
    const h = new Headers(spy.mock.calls[0][1]?.headers);
    expect(h.get("Authorization")).toBe("Bearer stale");
    expect(h.get("X-A")).toBe("1");
  });

  it("refreshes once on a 401, stores the new token, and replays the request with it", async () => {
    const spy = mockServer({
      refresh: () => res(200, { accessToken: "fresh" }),
      validToken: "fresh",
    });
    const r = await authFetch("/api/notes", { method: "POST", body: '{"a":1}' });
    expect(r.status).toBe(200);
    expect(refreshCalls(spy)).toHaveLength(1);
    expect(useAuthStore.getState().accessToken).toBe("fresh");
    const last = spy.mock.calls.at(-1)!;
    expect(bearer(last[1])).toBe("Bearer fresh");
    expect(last[1]?.body).toBe('{"a":1}');
  });

  it("does not loop: a replay that still 401s is returned as-is after a single refresh", async () => {
    const spy = mockServer({
      refresh: () => res(200, { accessToken: "fresh" }),
      validToken: "never",
    });
    const r = await authFetch("/api/notes");
    expect(r.status).toBe(401);
    expect(refreshCalls(spy)).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("signs the user out when the refresh says the session is gone, and returns the 401", async () => {
    useAuthStore.setState({ bookmarks: ["1:1"] });
    mockServer({ refresh: () => res(401, { error: "Session expired" }), validToken: "x" });
    const r = await authFetch("/api/notes");
    expect(r.status).toBe(401);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().bookmarks).toEqual([]);
  });

  it("keeps the session on a transient refresh failure (5xx) and returns the 401", async () => {
    mockServer({ refresh: () => res(503, { error: "Refresh failed" }), validToken: "x" });
    const r = await authFetch("/api/notes");
    expect(r.status).toBe(401);
    expect(useAuthStore.getState().accessToken).toBe("stale");
  });

  it("keeps the session when the refresh request itself throws", async () => {
    mockServer({
      refresh: () => Promise.reject(new TypeError("network down")),
      validToken: "x",
    });
    const r = await authFetch("/api/notes");
    expect(r.status).toBe(401);
    expect(useAuthStore.getState().accessToken).toBe("stale");
  });

  it("shares a single refresh across parallel 401s", async () => {
    const spy = mockServer({
      refresh: () =>
        new Promise<Response>((resolve) =>
          setTimeout(() => resolve(res(200, { accessToken: "fresh" })), 10)
        ),
      validToken: "fresh",
    });
    const all = await Promise.all([authFetch("/a"), authFetch("/b"), authFetch("/c")]);
    expect(all.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshCalls(spy)).toHaveLength(1);
  });

  it("replays with the already-rotated token instead of refreshing again for a late 401", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const spy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      if (String(input) === "/api/auth/refresh") return res(200, { accessToken: "fresh" });
      if (String(input) === "/late") await gate;
      return bearer(init) === "Bearer fresh" ? res(200) : res(401);
    });
    const late = authFetch("/late");
    await authFetch("/early");
    expect(useAuthStore.getState().accessToken).toBe("fresh");
    release();
    expect((await late).status).toBe(200);
    expect(refreshCalls(spy as never)).toHaveLength(1);
  });

  it("does not refresh or sign anyone out when there is no token", async () => {
    useAuthStore.setState({ accessToken: null });
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(res(401));
    const r = await authFetch("/api/notes");
    expect(r.status).toBe(401);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(new Headers(spy.mock.calls[0][1]?.headers).has("Authorization")).toBe(false);
  });

  it("does not sign out a user who re-authenticated while the refresh was running", async () => {
    mockServer({
      refresh: () => {
        useAuthStore.setState({ accessToken: "new-session" });
        return res(401);
      },
      validToken: "x",
    });
    await authFetch("/api/notes");
    expect(useAuthStore.getState().accessToken).toBe("new-session");
  });
});
