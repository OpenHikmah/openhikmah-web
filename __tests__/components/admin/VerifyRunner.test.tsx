import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockApi = vi.fn();
vi.mock("@/components/admin/AdminContext", async () => {
  const actual = await vi.importActual("@/components/admin/AdminContext");
  return { ...actual, useAdminFetch: () => mockApi };
});

import { VerifyRunner } from "@/components/admin/VerifyRunner";
import { AdminApiError } from "@/components/admin/AdminContext";

/** Fills the two required budget fields (the first two spinbuttons). */
function fillBudgets(calls = "40", cost = "1.5") {
  const spin = screen.getAllByRole("spinbutton");
  fireEvent.change(spin[0], { target: { value: calls } });
  fireEvent.change(spin[1], { target: { value: cost } });
}

async function clickRun(confirmLabel: string) {
  fireEvent.click(screen.getByRole("button", { name: "Run verification" }));
  const confirm = await screen.findByRole("button", { name: confirmLabel });
  await act(async () => {
    fireEvent.click(confirm);
  });
}

describe("VerifyRunner", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue({ runId: 1 });
  });

  it("disables Run and posts nothing while the budget fields are blank", () => {
    render(<VerifyRunner />);

    expect(screen.getByRole("button", { name: "Run verification" })).toBeDisabled();
    expect(screen.getByText(/Enter Max LLM calls, Max cost and a valid delay/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run verification" }));
    expect(screen.queryByRole("button", { name: "Verify on gemini?" })).not.toBeInTheDocument();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it("posts the verify-connections job with the entered params after the two-click confirm", async () => {
    render(<VerifyRunner />);
    fillBudgets("40", "1.5");

    await clickRun("Verify on gemini?");

    expect(mockApi).toHaveBeenCalledWith("/jobs", {
      method: "POST",
      json: {
        jobId: "verify-connections",
        params: { provider: "gemini", maxCalls: 40, maxCostUsd: 1.5, callDelayMs: 1500 },
      },
    });
  });

  it("switching to claude resets the delay to 0 and sends the claude provider and a chosen model", async () => {
    render(<VerifyRunner />);
    const [provider, model] = screen.getAllByRole("combobox");
    fireEvent.change(provider, { target: { value: "claude" } });
    const claudeModel = (model as HTMLSelectElement).options[1].value;
    fireEvent.change(model, { target: { value: claudeModel } });
    fillBudgets("10", "2");

    await clickRun("Verify on claude?");

    expect(mockApi).toHaveBeenCalledWith("/jobs", {
      method: "POST",
      json: {
        jobId: "verify-connections",
        params: {
          provider: "claude",
          model: claudeModel,
          maxCalls: 10,
          maxCostUsd: 2,
          callDelayMs: 0,
        },
      },
    });
  });

  it("rejects an out-of-range delay without posting", () => {
    render(<VerifyRunner />);
    fillBudgets();
    const spin = screen.getAllByRole("spinbutton");
    fireEvent.change(spin[2], { target: { value: "60001" } });
    expect(screen.getByRole("button", { name: "Run verification" })).toBeDisabled();
  });

  it("keeps the typed inputs and shows the server message when a job is already running", async () => {
    mockApi.mockRejectedValueOnce(new AdminApiError(400, "Job is already running"));
    render(<VerifyRunner />);
    fillBudgets("40", "1.5");

    await clickRun("Verify on gemini?");

    expect(await screen.findByText("Job is already running")).toBeInTheDocument();
    const spin = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(spin[0].value).toBe("40");
    expect(spin[1].value).toBe("1.5");
  });

  it("calls onStarted and shows the success note when the job starts", async () => {
    const onStarted = vi.fn();
    render(<VerifyRunner onStarted={onStarted} />);
    fillBudgets();

    await clickRun("Verify on gemini?");

    expect(onStarted).toHaveBeenCalledOnce();
    expect(screen.getByText(/Started\. Watch progress on the Jobs page\./)).toBeInTheDocument();
  });
});
