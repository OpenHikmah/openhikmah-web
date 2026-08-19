import { act, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

import { AdminGate } from "@/components/admin/AdminGate";
import { useAdmin } from "@/components/admin/AdminContext";
import { useAuthStore } from "@/store/auth";

function Child() {
  const { adminQfId, username } = useAdmin();
  return (
    <div>
      admin: {adminQfId} / {username}
    </div>
  );
}

const previousAuthState = useAuthStore.getState();

afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.setState(previousAuthState);
});

describe("AdminGate", () => {
  it("shows the denied screen when there is no access token", async () => {
    useAuthStore.setState({ accessToken: null, isSessionLoading: false });

    renderWithIntl(
      <AdminGate>
        <Child />
      </AdminGate>
    );

    expect(await screen.findByText(/could not be found/i)).toBeInTheDocument();
    expect(screen.queryByText(/^admin:/)).not.toBeInTheDocument();
  });

  it("shows the denied screen when /api/admin/me responds non-OK", async () => {
    useAuthStore.setState({ accessToken: "tok", isSessionLoading: false });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ error: "Not found" }), { status: 404 }))
    );

    renderWithIntl(
      <AdminGate>
        <Child />
      </AdminGate>
    );

    expect(await screen.findByText(/could not be found/i)).toBeInTheDocument();
    expect(screen.queryByText(/^admin:/)).not.toBeInTheDocument();
  });

  it("renders children with the admin context once /api/admin/me succeeds", async () => {
    useAuthStore.setState({ accessToken: "tok", isSessionLoading: false });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ qfId: "qf-admin", username: "devadmin" }), { status: 200 })
        )
    );

    renderWithIntl(
      <AdminGate>
        <Child />
      </AdminGate>
    );

    expect(await screen.findByText("admin: qf-admin / devadmin")).toBeInTheDocument();
    expect(screen.queryByText(/could not be found/i)).not.toBeInTheDocument();
  });

  it("shows the authorising state and does not fetch while the session is still loading", () => {
    useAuthStore.setState({ accessToken: null, isSessionLoading: true });
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    renderWithIntl(
      <AdminGate>
        <Child />
      </AdminGate>
    );

    expect(screen.getByText(/Authorising/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls /api/admin/me with the bearer token once the session resolves", async () => {
    useAuthStore.setState({ accessToken: null, isSessionLoading: true });
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ qfId: "qf-admin", username: "devadmin" }), { status: 200 })
      );
    vi.stubGlobal("fetch", mockFetch);

    renderWithIntl(
      <AdminGate>
        <Child />
      </AdminGate>
    );

    expect(mockFetch).not.toHaveBeenCalled();

    act(() => {
      useAuthStore.setState({ accessToken: "tok", isSessionLoading: false });
    });

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/me", {
        headers: { Authorization: "Bearer tok" },
      })
    );
  });
});
