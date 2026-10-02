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

/** The form fetches /gemini-keys on mount and POSTs to /jobs on submit. */
function mockApiImpl(keys: string[] = ["GEMINI_API1", "GEMINI_API2"], jobError?: Error) {
  return (path: string) => {
    if (path === "/gemini-keys") return Promise.resolve({ keys });
    return jobError ? Promise.reject(jobError) : Promise.resolve({ runId: 1 });
  };
}

/** POST calls to /jobs only (excludes the /gemini-keys mount fetch). */
function jobPosts() {
  return mockApi.mock.calls.filter((c) => c[0] === "/jobs");
}

describe("VerifyRunner", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockImplementation(mockApiImpl());
  });

  it("disables Run and posts nothing while the budget fields are blank", () => {
    render(<VerifyRunner />);

    expect(screen.getByRole("button", { name: "Run verification" })).toBeDisabled();
    expect(screen.getByText(/Enter Max LLM calls, Max cost and a valid delay/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run verification" }));
    expect(screen.queryByRole("button", { name: "Verify on gemini?" })).not.toBeInTheDocument();
    expect(jobPosts()).toHaveLength(0);
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
    mockApi.mockImplementation(
      mockApiImpl(undefined, new AdminApiError(400, "Job is already running"))
    );
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

describe("VerifyRunner loop mode", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockImplementation(mockApiImpl());
  });

  async function openLoop() {
    render(<VerifyRunner />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Loop: keep running/ }));
    await screen.findByRole("checkbox", { name: "GEMINI_API1" });
  }

  it("shows the key picker with every configured key ticked, and makes the budgets optional", async () => {
    await openLoop();
    expect(screen.getByRole("checkbox", { name: "GEMINI_API1" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "GEMINI_API2" })).toBeChecked();
    expect(screen.getByText("Max LLM calls (optional)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start loop" })).not.toBeDisabled();
  });

  it("forces Gemini and disables Claude while looping", async () => {
    await openLoop();
    const [provider] = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(provider.value).toBe("gemini");
    expect(provider).toBeDisabled();
  });

  it("submits loop:true with the selected keys, the delay, and no blank budgets", async () => {
    await openLoop();
    fireEvent.click(screen.getByRole("checkbox", { name: "GEMINI_API2" }));

    fireEvent.click(screen.getByRole("button", { name: "Start loop" }));
    const confirm = await screen.findByRole("button", { name: "Loop verification on 1 key(s)?" });
    await act(async () => {
      fireEvent.click(confirm);
    });

    expect(jobPosts()).toEqual([
      [
        "/jobs",
        {
          method: "POST",
          json: {
            jobId: "verify-connections",
            params: { provider: "gemini", loop: true, keys: ["GEMINI_API1"], callDelayMs: 1500 },
          },
        },
      ],
    ]);
  });

  it("sends optional caps when they are filled in", async () => {
    await openLoop();
    const spin = screen.getAllByRole("spinbutton");
    fireEvent.change(spin[0], { target: { value: "500" } });
    fireEvent.change(spin[1], { target: { value: "2" } });

    fireEvent.click(screen.getByRole("button", { name: "Start loop" }));
    const confirm = await screen.findByRole("button", { name: "Loop verification on 2 key(s)?" });
    await act(async () => {
      fireEvent.click(confirm);
    });

    expect(jobPosts()[0][1].json.params).toMatchObject({ maxCalls: 500, maxCostUsd: 2 });
  });

  it("keeps Start disabled when no key is selected", async () => {
    await openLoop();
    fireEvent.click(screen.getByRole("checkbox", { name: "GEMINI_API1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "GEMINI_API2" }));
    expect(screen.getByRole("button", { name: "Start loop" })).toBeDisabled();
    expect(screen.getByText(/Select at least one Gemini key/)).toBeInTheDocument();
  });

  it("explains when no pool keys are configured", async () => {
    mockApi.mockImplementation(mockApiImpl([]));
    render(<VerifyRunner />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Loop: keep running/ }));
    expect(await screen.findByText(/No GEMINI_API1..5 keys configured/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start loop" })).toBeDisabled();
  });

  it("says the key list could not be loaded instead of claiming none are configured", async () => {
    mockApi.mockImplementation((path: string) =>
      path === "/gemini-keys" ? Promise.reject(new Error("401")) : Promise.resolve({})
    );
    render(<VerifyRunner />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Loop: keep running/ }));
    expect(await screen.findByText(/Reload the page to retry/)).toBeInTheDocument();
  });
});
