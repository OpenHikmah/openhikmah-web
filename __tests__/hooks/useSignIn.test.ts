import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSignIn } from "@/hooks/useSignIn";

describe("useSignIn", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    sessionStorage.clear();
    // jsdom can't navigate; assigning window.location.href just logs this.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("uses the server-issued state and nonce from /api/auth/start (issue #636)", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ state: "issued-state", nonce: "issued-nonce" }), {
        status: 200,
      })
    );
    const { result } = renderHook(() => useSignIn());

    await act(async () => {
      await result.current.signIn();
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/auth/start", { method: "POST" });
    expect(sessionStorage.getItem("pkce_state")).toBe("issued-state");
    expect(sessionStorage.getItem("pkce_nonce")).toBe("issued-nonce");
    expect(sessionStorage.getItem("pkce_code_verifier")).toHaveLength(128);
  });

  it("re-enables the button and stores nothing when /api/auth/start fails", async () => {
    mockFetch.mockResolvedValue(new Response("", { status: 500 }));
    const { result } = renderHook(() => useSignIn());

    await act(async () => {
      await result.current.signIn();
    });

    expect(result.current.signingIn).toBe(false);
    expect(sessionStorage.getItem("pkce_state")).toBeNull();
    expect(sessionStorage.getItem("pkce_code_verifier")).toBeNull();
  });
});
