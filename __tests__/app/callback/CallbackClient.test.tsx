import { screen, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, refresh: vi.fn() }),
}));

import IntlMessageFormat from "intl-messageformat";
import { CallbackClient } from "@/app/callback/CallbackClient";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";
import ru from "@/messages/ru.json";
import az from "@/messages/az.json";

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
        body: JSON.stringify({
          code: "auth-code",
          codeVerifier: "verifier",
          state: "state-123",
          nonce: "nonce-abc",
        }),
      })
    );
  });
});

describe("CallbackClient — localisation and live-region semantics", () => {
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

  it("announces the in-progress state as a status using the localised common.signingIn string", async () => {
    sessionStorage.setItem("pkce_code_verifier", "verifier");
    sessionStorage.setItem("pkce_state", "state-123");
    sessionStorage.setItem("pkce_nonce", "nonce-abc");
    mockFetch.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      renderWithIntl(<CallbackClient code="auth-code" state="state-123" />, "tr");
    });

    expect(screen.getByRole("status")).toHaveTextContent(tr.common.signingIn);
  });

  const failureCases: {
    name: string;
    setup: () => void;
    props: { code?: string; state?: string; error?: string };
    messageKey: keyof typeof en.callback;
    values?: Record<string, string>;
  }[] = [
    {
      name: "a missing authorization code",
      setup: () => {},
      props: {},
      messageKey: "noAuthorizationCode",
    },
    {
      name: "a provider error",
      setup: () => {},
      props: { error: "access_denied" },
      messageKey: "providerError",
      values: { error: "access_denied" },
    },
    {
      name: "missing PKCE session storage",
      setup: () => {},
      props: { code: "c", state: "s" },
      messageKey: "sessionExpired",
    },
    {
      name: "a state mismatch",
      setup: () => {
        sessionStorage.setItem("pkce_code_verifier", "verifier");
        sessionStorage.setItem("pkce_state", "expected");
        sessionStorage.setItem("pkce_nonce", "nonce-abc");
      },
      props: { code: "c", state: "other" },
      messageKey: "stateMismatch",
    },
    {
      name: "a failed code exchange",
      setup: () => {
        sessionStorage.setItem("pkce_code_verifier", "verifier");
        sessionStorage.setItem("pkce_state", "s");
        sessionStorage.setItem("pkce_nonce", "nonce-abc");
        vi.spyOn(console, "error").mockImplementation(() => {});
        mockFetch.mockResolvedValue(new Response("boom", { status: 500 }));
      },
      props: { code: "c", state: "s" },
      messageKey: "unexpectedError",
    },
  ];

  for (const locale of ["en", "tr", "ru", "az"] as const) {
    for (const c of failureCases) {
      it(`renders ${c.name} in ${locale} inside an alert`, async () => {
        c.setup();
        const messages = { en, tr, ru, az }[locale].callback;
        const expected = new IntlMessageFormat(messages[c.messageKey], locale).format(
          c.values
        ) as string;

        await act(async () => {
          renderWithIntl(<CallbackClient {...c.props} />, locale);
        });

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(messages.signInFailed);
        expect(alert).toHaveTextContent(expected);
        expect(screen.getByRole("button", { name: messages.backToHome })).toBeInTheDocument();
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
      });
    }
  }

  it("does not leak the raw exchange error body to the user", async () => {
    sessionStorage.setItem("pkce_code_verifier", "verifier");
    sessionStorage.setItem("pkce_state", "s");
    sessionStorage.setItem("pkce_nonce", "nonce-abc");
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockResolvedValue(new Response("internal secret detail", { status: 500 }));

    await act(async () => {
      renderWithIntl(<CallbackClient code="c" state="s" />);
    });

    expect(await screen.findByRole("alert")).not.toHaveTextContent("internal secret detail");
  });
});
