import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { useAuthStore } from "@/store/auth";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  useAuthStore.setState({ accessToken: "stale-token" });
  vi.restoreAllMocks();
});

describe("useAdminFetch 401 recovery", () => {
  it("refreshes the token once and replays the request after a 401", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/api/auth/refresh")) {
        return Promise.resolve(jsonResponse({ accessToken: "fresh-token" }));
      }
      const auth = new Headers(init?.headers).get("Authorization");
      if (auth === "Bearer fresh-token") return Promise.resolve(jsonResponse({ ok: true }));
      return Promise.resolve(jsonResponse({ error: "Unauthorized" }, 401));
    });

    const { result } = renderHook(() => useAdminFetch());
    const data = await result.current<{ ok: boolean }>("/connections");

    expect(data).toEqual({ ok: true });
    expect(useAuthStore.getState().accessToken).toBe("fresh-token");
    const refreshCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).endsWith("/api/auth/refresh")
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("surfaces the 401 when the refresh itself fails", async () => {
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/api/auth/refresh")) {
        return Promise.resolve(jsonResponse({ error: "no session" }, 401));
      }
      return Promise.resolve(jsonResponse({ error: "Unauthorized" }, 401));
    });

    const { result } = renderHook(() => useAdminFetch());
    const err = await result.current("/connections").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminApiError);
    expect((err as AdminApiError).status).toBe(401);
  });

  it("dedupes the refresh across parallel admin calls", async () => {
    let refreshCount = 0;
    vi.spyOn(global, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/api/auth/refresh")) {
        refreshCount += 1;
        return new Promise((resolve) =>
          setTimeout(() => resolve(jsonResponse({ accessToken: "fresh-token" })), 10)
        );
      }
      const auth = new Headers(init?.headers).get("Authorization");
      if (auth === "Bearer fresh-token") return Promise.resolve(jsonResponse({ ok: true }));
      return Promise.resolve(jsonResponse({ error: "Unauthorized" }, 401));
    });

    const { result } = renderHook(() => useAdminFetch());
    await Promise.all([
      result.current("/connections"),
      result.current("/users"),
      result.current("/names"),
    ]);

    expect(refreshCount).toBe(1);
  });
});
