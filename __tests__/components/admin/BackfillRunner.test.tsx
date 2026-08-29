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
    mockApi.mockResolvedValue({ runId: "run_1" });
  });

  it("disables Run and posts nothing while the budget fields are blank", async () => {
    render(<BackfillRunner />);

    expect(screen.getByRole("button", { name: "Run backfill" })).toBeDisabled();
    expect(screen.getByText(/Enter Max LLM calls and Max cost to enable/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run backfill" }));

    // Never even arms the two-click confirm.
    expect(
      screen.queryByRole("button", { name: "Run baseline on gemini?" })
    ).not.toBeInTheDocument();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it("enables Run once the budgets are filled and then starts the job", async () => {
    render(<BackfillRunner />);

    expect(screen.getByRole("button", { name: "Run backfill" })).toBeDisabled();

    fillBudgets("10", "2");

    expect(screen.getByRole("button", { name: "Run backfill" })).not.toBeDisabled();
    expect(
      screen.queryByText(/Enter Max LLM calls and Max cost to enable/)
    ).not.toBeInTheDocument();

    await clickRun("Run baseline on gemini?");

    await waitFor(() =>
      expect(screen.getByText(/Watch progress on the Jobs page/)).toBeInTheDocument()
    );
    expect(mockApi).toHaveBeenCalledWith("/jobs", expect.objectContaining({ method: "POST" }));
  });

  it("keeps the admin's typed inputs after an 'already running' error", async () => {
    render(<BackfillRunner />);

    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "topup" } });
    fillBudgets("50", "3");

    mockApi.mockRejectedValueOnce(
      new AdminApiError(400, 'Job "backfill-connections" is already running')
    );

    await clickRun("Run topup on gemini?");

    await waitFor(() =>
      expect(screen.getByText('Job "backfill-connections" is already running')).toBeInTheDocument()
    );
    // The Run button stays usable — a second attempt is allowed (and rejected
    // server-side), not blocked client-side.
    expect(screen.getByRole("button", { name: "Run backfill" })).not.toBeDisabled();
    expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("topup");
    const spin = screen.getAllByRole("spinbutton");
    expect((spin[spin.length - 2] as HTMLInputElement).value).toBe("50");
    expect((spin[spin.length - 1] as HTMLInputElement).value).toBe("3");
  });

  it("calls onStarted and shows the success note when the job starts", async () => {
    const onStarted = vi.fn();
    render(<BackfillRunner onStarted={onStarted} />);

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

  it("never fetches job status — the form does not track a running job", async () => {
    render(<BackfillRunner />);
    fillBudgets("10", "2");
    await clickRun("Run baseline on gemini?");

    // Only the POST to start — no GET /jobs poll.
    expect(mockApi.mock.calls.every((c) => c[1]?.method === "POST")).toBe(true);
  });
});
