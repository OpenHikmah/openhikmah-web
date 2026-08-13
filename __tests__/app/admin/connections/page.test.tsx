import { render, screen } from "@testing-library/react";
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
});
