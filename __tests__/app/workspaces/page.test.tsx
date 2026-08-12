import { screen, act, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithIntl } from "../../test-utils/render-with-intl";

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspaces",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import WorkspacesPage from "@/app/workspaces/page";
import { useAuthStore } from "@/store/auth";
import { TooltipProvider } from "@/components/ui";

describe("WorkspacesPage — delete confirmation", () => {
  const mockFetch = vi.fn();
  const previousAuthState = useAuthStore.getState();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    useAuthStore.setState({ accessToken: "test-token", isSessionLoading: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState(previousAuthState);
  });

  const workspace = {
    id: 1,
    name: "3 verses — Jan 1",
    nodeCount: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("requires a second click before deleting a saved canvas", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify([workspace]), { status: 200 }));

    await act(async () => {
      renderWithIntl(
        <TooltipProvider>
          <WorkspacesPage />
        </TooltipProvider>
      );
    });

    await waitFor(() => expect(screen.getByText(workspace.name)).toBeInTheDocument());

    const deleteButton = screen.getByRole("button", { name: "Delete canvas" });
    fireEvent.click(deleteButton);

    // First click only arms the button — no DELETE request, row still present.
    expect(mockFetch).toHaveBeenCalledTimes(1); // just the initial GET
    expect(screen.getByText(workspace.name)).toBeInTheDocument();
    const confirmButton = screen.getByRole("button", { name: "Confirm delete canvas?" });

    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenLastCalledWith(
        "/api/workspace/1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
    await waitFor(() => expect(screen.queryByText(workspace.name)).not.toBeInTheDocument());
  });
});
