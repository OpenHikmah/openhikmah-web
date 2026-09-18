import { screen, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, refresh: vi.fn() }),
}));

import { CallbackClient } from "@/app/callback/CallbackClient";

describe("CallbackClient — PKCE session-storage guard", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockReplace.mockReset();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("fails closed with no exchange call when the nonce is missing from sessionStorage", async () => {
    sessionStorage.setItem("pkce_code_verifier", "verifier");
    sessionStorage.setItem("pkce_state", "state-123");
    // pkce_nonce intentionally absent — e.g. partial sessionStorage eviction.

    await act(async () => {
      renderWithIntl(<CallbackClient code="auth-code" state="state-123" />);
    });

    expect(await screen.findByText(/session expired/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("pkce_nonce")).toBeNull();
  });

  it("proceeds to the exchange call when the nonce is present", async () => {
    sessionStorage.setItem("pkce_code_verifier", "verifier");
    sessionStorage.setItem("pkce_state", "state-123");
    sessionStorage.setItem("pkce_nonce", "nonce-abc");
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ accessToken: "tok", userId: 1, username: "u", isNewUser: false }),
        {
          status: 200,
        }
      )
    );

    await act(async () => {
      renderWithIntl(<CallbackClient code="auth-code" state="state-123" />);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/auth/exchange",
      expect.objectContaining({
        body: JSON.stringify({ code: "auth-code", codeVerifier: "verifier", nonce: "nonce-abc" }),
      })
    );
  });
});
