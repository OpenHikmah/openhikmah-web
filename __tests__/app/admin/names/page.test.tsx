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

import NamesPage from "@/app/admin/names/page";

const row = {
  slug: "ar-rahman",
  kind: "pairings",
  data: { note: "original" },
  model: "claude-opus-4-7",
  version: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("NamesPage — Save requires confirmation", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue({ rows: [row] });
  });

  it("does not overwrite on the first click, locks the textarea while armed, and saves the confirmed content on the second click", async () => {
    render(<NamesPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));

    const textarea = await screen.findByDisplayValue(/"note": "original"/);
    fireEvent.change(textarea, { target: { value: '{"note": "edited"}' } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mockApi).not.toHaveBeenCalledWith(
      "/names",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(await screen.findByRole("button", { name: "Save?" })).toBeInTheDocument();
    expect(textarea).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Save?" }));

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/names", {
        method: "PATCH",
        json: { slug: "ar-rahman", kind: "pairings", data: { note: "edited" } },
      })
    );
  });
});
