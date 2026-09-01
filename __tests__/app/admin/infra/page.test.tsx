import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockApi = vi.fn();
vi.mock("@/components/admin/AdminContext", async () => {
  const actual = await vi.importActual("@/components/admin/AdminContext");
  return { ...actual, useAdminFetch: () => mockApi };
});

vi.mock("@/components/admin/InfoHint", () => ({ InfoHint: () => null }));

import InfraPage from "@/app/admin/infra/page";
import { AdminApiError } from "@/components/admin/AdminContext";

const INFRA = {
  redis: "disabled" as const,
  uptimeSeconds: 120,
  tokenCacheSize: 3,
  rateLimitRows: 0,
  metrics: {},
};

describe("InfraPage — maintenance action feedback", () => {
  beforeEach(() => mockApi.mockReset());

  it("shows a failed maintenance action in the error tone, not the neutral success style", async () => {
    mockApi
      .mockResolvedValueOnce(INFRA) // initial GET /infra
      .mockRejectedValueOnce(new AdminApiError(503, "Redis unreachable")) // POST
      .mockResolvedValue(INFRA); // any later reload

    render(<InfraPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Flush token cache" }));
    fireEvent.click(await screen.findByRole("button", { name: "Flush tokens?" }));

    const note = await screen.findByText("Redis unreachable");
    expect(note).toHaveClass("text-error");
  });

  it("shows a successful action in the success tone", async () => {
    mockApi
      .mockResolvedValueOnce(INFRA)
      .mockResolvedValueOnce({ action: "flush-tokens", cleared: 2 })
      .mockResolvedValue(INFRA);

    render(<InfraPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Flush token cache" }));
    fireEvent.click(await screen.findByRole("button", { name: "Flush tokens?" }));

    const note = await screen.findByText("Cleared 2 cached tokens.");
    expect(note).toHaveClass("text-teal");
  });
});
