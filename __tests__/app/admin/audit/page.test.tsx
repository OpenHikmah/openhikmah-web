import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockApi = vi.fn();
vi.mock("@/components/admin/AdminContext", async () => {
  const actual = await vi.importActual("@/components/admin/AdminContext");
  return {
    ...actual,
    useAdminFetch: () => mockApi,
  };
});

import AuditPage from "@/app/admin/audit/page";

const entry = (id: number) => ({
  id,
  adminQfId: "qf-admin",
  action: "user.disable",
  targetType: "user",
  targetId: String(id),
  meta: null,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("AuditPage — load more pagination", () => {
  beforeEach(() => {
    mockApi.mockReset();
  });

  it("renders the initial page and does not show Load more when hasMore is false", async () => {
    mockApi.mockResolvedValueOnce({ entries: [entry(1)], hasMore: false });

    render(<AuditPage />);

    await waitFor(() => expect(screen.getByText("user.disable")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("appends the next page on Load more, requesting the next offset, and hides the button once exhausted", async () => {
    mockApi.mockResolvedValueOnce({ entries: [entry(1)], hasMore: true });

    render(<AuditPage />);

    const loadMoreButton = await screen.findByRole("button", { name: /load more/i });

    mockApi.mockResolvedValueOnce({ entries: [entry(2)], hasMore: false });
    fireEvent.click(loadMoreButton);

    await waitFor(() => expect(mockApi).toHaveBeenLastCalledWith("/audit?offset=1"));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument()
    );

    const targets = screen.getAllByText(/user:/);
    expect(targets).toHaveLength(2);
  });
});
