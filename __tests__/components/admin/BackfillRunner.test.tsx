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

/** Fills both required budget fields so `startRun` clears its guard. */
function fillBudgets(calls = "10", cost = "2") {
  const spin = screen.getAllByRole("spinbutton");
  fireEvent.change(spin[spin.length - 2], { target: { value: calls } });
  fireEvent.change(spin[spin.length - 1], { target: { value: cost } });
}

async function clickRun(confirmLabel: string) {
  fireEvent.click(screen.getByRole("button", { name: "Run backfill" }));
  const confirm = await screen.findByRole("button", { name: confirmLabel });
  await act(async () => {
    fireEvent.click(confirm);
  });
}

describe("BackfillRunner", () => {
  beforeEach(() => {
    mockApi.mockReset();
    // Default: the /jobs status poll reports nothing running.
    mockApi.mockResolvedValue({ jobs: [] });
  });

  it("blocks the run and posts nothing when the budget fields are blank", async () => {
    render(<BackfillRunner />);
    await act(async () => {}); // flush the mount /jobs fetch

    const postCallsBefore = mockApi.mock.calls.filter((c) => c[1]?.method === "POST").length;
    await clickRun("Run baseline on gemini?");

    expect(await screen.findByText(/Set Max LLM calls and Max cost/)).toBeInTheDocument();
    const postCallsAfter = mockApi.mock.calls.filter((c) => c[1]?.method === "POST").length;
    expect(postCallsAfter).toBe(postCallsBefore);
  });

  it("keeps the admin's typed inputs after an 'already running' error", async () => {
    render(<BackfillRunner />);
    await act(async () => {});

    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "topup" } });
    fillBudgets("50", "3");

    mockApi.mockRejectedValueOnce(
      new AdminApiError(400, 'Job "backfill-connections" is already running')
    );

    await clickRun("Run topup on gemini?");

    await waitFor(() =>
      expect(screen.getByText('Job "backfill-connections" is already running')).toBeInTheDocument()
    );
    expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("topup");
    const spin = screen.getAllByRole("spinbutton");
    expect((spin[spin.length - 2] as HTMLInputElement).value).toBe("50");
    expect((spin[spin.length - 1] as HTMLInputElement).value).toBe("3");
  });

  it("calls onStarted and shows the success note when the job starts", async () => {
    const onStarted = vi.fn();
    render(<BackfillRunner onStarted={onStarted} />);
    await act(async () => {});

    fillBudgets("10", "2");
    mockApi.mockResolvedValueOnce({ runId: "run_1" });

    await clickRun("Run baseline on gemini?");

    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Watch progress on the Jobs page/)).toBeInTheDocument();
    expect(mockApi).toHaveBeenCalledWith(
      "/jobs",
      expect.objectContaining({
        method: "POST",
        json: expect.objectContaining({
          jobId: "backfill-connections",
          params: expect.objectContaining({ maxCalls: 10, maxCostUsd: 2 }),
        }),
      })
    );
  });

  it("shows a Stop button when the backfill job is running and posts action:stop", async () => {
    mockApi.mockResolvedValue({ jobs: [{ id: "backfill-connections", status: "running" }] });
    render(<BackfillRunner />);

    const stop = await screen.findByRole("button", { name: "Stop running job" });
    fireEvent.click(stop);
    const confirm = await screen.findByRole("button", {
      name: "Stop the running backfill job?",
    });
    await act(async () => {
      fireEvent.click(confirm);
    });

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        "/jobs",
        expect.objectContaining({
          method: "POST",
          json: { jobId: "backfill-connections", action: "stop" },
        })
      )
    );
  });
});
