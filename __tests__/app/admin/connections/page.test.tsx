import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockApi = vi.fn();
vi.mock("@/components/admin/AdminContext", async () => {
  const actual = await vi.importActual("@/components/admin/AdminContext");
  return {
    ...actual,
    useAdminFetch: () => mockApi,
  };
});

import ConnectionsPage from "@/app/admin/connections/page";

const baseConnection = {
  id: 1,
  fromRef: "2:255",
  toRef: "24:35",
  kind: "thematic",
  reason: "Both describe divine light and knowledge.",
  model: "claude-opus-4-7",
  status: "active" as const,
  reviewedAt: null,
};

describe("ConnectionsPage — confidence column", () => {
  beforeEach(() => {
    mockApi.mockReset();
  });

  it("renders the confidence percentage for a connection that has one", async () => {
    mockApi.mockResolvedValue({
      connections: [{ ...baseConnection, confidence: 82 }],
    });

    render(<ConnectionsPage />);

    expect(await screen.findByText("82%")).toBeInTheDocument();
  });

  it("renders a placeholder when confidence is null", async () => {
    mockApi.mockResolvedValue({
      connections: [{ ...baseConnection, confidence: null }],
    });

    render(<ConnectionsPage />);

    expect(await screen.findByText("2:255 → 24:35")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("flags sub-50% confidence for review instead of coloring it as an error", async () => {
    mockApi.mockResolvedValue({
      connections: [{ ...baseConnection, confidence: 42 }],
    });

    render(<ConnectionsPage />);

    const confidence = await screen.findByText("42%");
    expect(confidence.className).toContain("text-gold");
    expect(confidence.className).not.toContain("text-error");
  });

  it("shows Load more only when hasMore, and appends the next page with an offset", async () => {
    mockApi
      .mockResolvedValueOnce({
        connections: [{ ...baseConnection, id: 1, fromRef: "1:1", confidence: 80 }],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        connections: [{ ...baseConnection, id: 2, fromRef: "2:2", confidence: 70 }],
        hasMore: false,
      });

    render(<ConnectionsPage />);

    const loadMore = await screen.findByRole("button", { name: "Load more" });
    fireEvent.click(loadMore);

    await waitFor(() => expect(screen.getByText("2:2 → 24:35")).toBeInTheDocument());
    expect(screen.getByText("1:1 → 24:35")).toBeInTheDocument();
    expect(mockApi.mock.calls[1][0]).toContain("offset=1");
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });
});
