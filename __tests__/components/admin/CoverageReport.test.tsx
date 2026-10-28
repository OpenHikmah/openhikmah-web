import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockApi = vi.fn();
vi.mock("@/components/admin/AdminContext", async () => {
  const actual = await vi.importActual("@/components/admin/AdminContext");
  return { ...actual, useAdminFetch: () => mockApi };
});
vi.mock("@/components/admin/BackfillRunner", () => ({
  BackfillRunner: () => <div data-testid="backfill" />,
}));
vi.mock("@/components/admin/VerifyRunner", () => ({
  VerifyRunner: ({ variant }: { variant?: string }) => (
    <div data-testid={variant === "translations" ? "verify-translations" : "verify-connections"} />
  ),
}));

import { CoverageReport } from "@/components/admin/CoverageReport";

const hiddenAncestor = (el: HTMLElement) => el.closest("[hidden]");

describe("CoverageReport — tabs", () => {
  it("shows only the report at first, and keeps the runners mounted but hidden", async () => {
    mockApi.mockReturnValue(new Promise(() => {}));
    render(<CoverageReport />);

    expect(screen.getByRole("button", { name: "Report" })).toHaveAttribute("aria-pressed", "true");
    expect(hiddenAncestor(screen.getByTestId("backfill"))).not.toBeNull();
    expect(hiddenAncestor(screen.getByTestId("verify-connections"))).not.toBeNull();
    expect(hiddenAncestor(screen.getByTestId("verify-translations"))).not.toBeNull();
  });

  it("reveals the backfill runner, then both verify runners, as tabs are chosen", async () => {
    mockApi.mockReturnValue(new Promise(() => {}));
    render(<CoverageReport />);

    fireEvent.click(screen.getByRole("button", { name: "Backfill" }));
    expect(hiddenAncestor(screen.getByTestId("backfill"))).toBeNull();
    expect(hiddenAncestor(screen.getByTestId("verify-connections"))).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(hiddenAncestor(screen.getByTestId("backfill"))).not.toBeNull());
    expect(hiddenAncestor(screen.getByTestId("verify-connections"))).toBeNull();
    expect(hiddenAncestor(screen.getByTestId("verify-translations"))).toBeNull();
  });
});
