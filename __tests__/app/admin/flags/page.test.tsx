import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockApi = vi.fn();
vi.mock("@/components/admin/AdminContext", async () => {
  const actual = await vi.importActual("@/components/admin/AdminContext");
  return { ...actual, useAdminFetch: () => mockApi };
});

import FlagsPage from "@/app/admin/flags/page";

type Route = { provider: "claude" | "gemini"; model: string };

function response(
  rows: Record<string, unknown>,
  resolvedAi?: Partial<Record<"default" | "connections" | "names", Route>>
) {
  const claude: Route = { provider: "claude", model: "claude-opus-4-7" };
  return {
    flags: Object.entries(rows).map(([key, value]) => ({
      key,
      value,
      updatedBy: "qf-admin",
      updatedAt: "2026-08-01T00:00:00Z",
    })),
    resolvedAi: {
      default: resolvedAi?.default ?? claude,
      connections: resolvedAi?.connections ?? claude,
      names: resolvedAi?.names ?? claude,
    },
  };
}

describe("FlagsPage — AI routing grid", () => {
  beforeEach(() => {
    mockApi.mockReset();
  });

  it("scopes model options to the route's server-resolved provider and writes the right key", async () => {
    // Names route resolves to Gemini server-side (flag or env — the client only
    // sees the resolved result).
    mockApi.mockImplementation((_path: string, opts?: { method?: string }) => {
      if (!opts || opts.method !== "PUT")
        return Promise.resolve(
          response(
            { ai_provider_names: "gemini" },
            { names: { provider: "gemini", model: "gemini-3.5-flash-lite" } }
          )
        );
      return Promise.resolve({});
    });

    render(<FlagsPage />);

    const namesModel = await screen.findByLabelText("Names (Asma-ul-Husna) model");
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

  it("offers the resolved provider's models even when only an env var (no flag) selects it", async () => {
    // No provider flag set, but the server resolves Default to Gemini via AI_PROVIDER.
    mockApi.mockResolvedValue(
      response({}, { default: { provider: "gemini", model: "gemini-3.5-flash-lite" } })
    );
    render(<FlagsPage />);

    const defaultModel = await screen.findByLabelText("Default model");
    expect(within(defaultModel).queryByText("gemini-3.7-flash")).toBeTruthy();
    expect(within(defaultModel).queryByText("claude-opus-4-7")).toBeNull();
  });
});
