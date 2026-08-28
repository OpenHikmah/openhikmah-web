import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockApi = vi.fn();
vi.mock("@/components/admin/AdminContext", async () => {
  const actual = await vi.importActual("@/components/admin/AdminContext");
  return { ...actual, useAdminFetch: () => mockApi };
});

import FlagsPage from "@/app/admin/flags/page";

function flags(rows: Record<string, unknown>) {
  return {
    flags: Object.entries(rows).map(([key, value]) => ({
      key,
      value,
      updatedBy: "qf-admin",
      updatedAt: "2026-08-01T00:00:00Z",
    })),
  };
}

describe("FlagsPage — AI routing grid", () => {
  beforeEach(() => {
    mockApi.mockReset();
  });

  it("scopes a route's model options to its selected provider and writes the right flag key", async () => {
    // Names route pinned to Gemini; everything else default.
    mockApi.mockImplementation((path: string, opts?: { method?: string }) => {
      if (!opts || opts.method !== "PUT")
        return Promise.resolve(flags({ ai_provider_names: "gemini" }));
      return Promise.resolve({});
    });

    render(<FlagsPage />);

    const namesModel = await screen.findByLabelText("Names (Asma-ul-Husna) model");
    // Gemini models are offered, not Claude ones.
    expect(within(namesModel).queryByText("gemini-3.7-flash")).toBeTruthy();
    expect(within(namesModel).queryByText("claude-opus-4-7")).toBeNull();

    fireEvent.change(namesModel, { target: { value: "gemini-3.7-flash" } });
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        "/flags",
        expect.objectContaining({
          method: "PUT",
          json: { key: "ai_model_names", value: "gemini-3.7-flash" },
        })
      )
    );
  });

  it("offers Claude models for the default route when nothing is configured", async () => {
    mockApi.mockResolvedValue(flags({}));
    render(<FlagsPage />);

    const defaultModel = await screen.findByLabelText("Default model");
    expect(within(defaultModel).queryByText("claude-opus-4-7")).toBeTruthy();
    expect(within(defaultModel).queryByText("gemini-3.7-flash")).toBeNull();
  });
});
