import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockApi = vi.fn();
vi.mock("@/components/admin/AdminContext", async () => {
  const actual = await vi.importActual("@/components/admin/AdminContext");
  return {
    ...actual,
    useAdminFetch: () => mockApi,
  };
});

import { BackfillRunner } from "@/components/admin/BackfillRunner";
import { AdminApiError } from "@/components/admin/AdminContext";

describe("BackfillRunner", () => {
  beforeEach(() => {
    mockApi.mockReset();
  });

  it("keeps the admin's typed inputs after an 'already running' error", async () => {
    render(<BackfillRunner />);

    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "topup" } });
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "50" } });

    mockApi.mockRejectedValueOnce(
      new AdminApiError(400, 'Job "backfill-connections" is already running')
    );

    fireEvent.click(screen.getByRole("button", { name: "Run backfill" }));
    const confirm = await screen.findByRole("button", { name: "Run topup on gemini?" });
    await act(async () => {
      fireEvent.click(confirm);
    });

    await waitFor(() =>
      expect(screen.getByText('Job "backfill-connections" is already running')).toBeInTheDocument()
    );
    // The inputs must not have reset to their defaults.
    expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("topup");
    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("50");
  });

  it("calls onStarted and shows the success note when the job starts", async () => {
    const onStarted = vi.fn();
    render(<BackfillRunner onStarted={onStarted} />);

    mockApi.mockResolvedValueOnce({ runId: "run_1" });

    fireEvent.click(screen.getByRole("button", { name: "Run backfill" }));
    const confirm = await screen.findByRole("button", { name: "Run baseline on gemini?" });
    await act(async () => {
      fireEvent.click(confirm);
    });

    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Watch progress on the Jobs page/)).toBeInTheDocument();
    expect(mockApi).toHaveBeenCalledWith(
      "/jobs",
      expect.objectContaining({ method: "POST", json: expect.objectContaining({ jobId: "backfill-connections" }) })
    );
  });
});
