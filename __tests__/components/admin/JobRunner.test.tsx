import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockApi = vi.fn();
vi.mock("@/components/admin/AdminContext", async () => {
  const actual = await vi.importActual("@/components/admin/AdminContext");
  return {
    ...actual,
    useAdminFetch: () => mockApi,
  };
});

import { JobRunner } from "@/components/admin/JobRunner";

const runningJob = {
  id: "seed-quran" as const,
  label: "Seed Quran",
  status: "running" as const,
  startedAt: new Date().toISOString(),
  completedAt: null,
  error: null,
  logTail: "working…",
};

const neverRunJob = {
  id: "seed-quran" as const,
  label: "Seed Quran",
  status: "never-run" as const,
  startedAt: null,
  completedAt: null,
  error: null,
  logTail: null,
};

describe("JobRunner — polling keeps the table on a transient poll error", () => {
  beforeEach(() => {
    mockApi.mockReset();
    // shouldAdvanceTime lets the real clock keep the fake one ticking, so
    // testing-library's setTimeout-based `waitFor` still resolves while the
    // component's own `setInterval` (which must be fake for this test) runs.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps showing the last-good jobs table when a 4s poll errors", async () => {
    mockApi.mockResolvedValueOnce({
      jobs: [runningJob],
      embedCoverage: { embedded: 10, total: 20 },
    });

    render(<JobRunner />);
    await waitFor(() => expect(screen.getByText("Seed Quran")).toBeInTheDocument());

    mockApi.mockRejectedValueOnce(new Error("transient 5xx"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    // The table (and the running job's row) must still be visible — a
    // background poll blip shouldn't wipe it, only surface the error banner.
    expect(screen.getByText("Seed Quran")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("clears stale data if the reload right after starting a job fails, rather than stranding it", async () => {
    mockApi.mockResolvedValueOnce({
      jobs: [neverRunJob],
      embedCoverage: { embedded: 10, total: 20 },
    });

    render(<JobRunner />);
    await waitFor(() => expect(screen.getByText("Seed Quran")).toBeInTheDocument());

    const runButton = screen.getByRole("button", { name: "Run" });
    fireEvent.click(runButton);
    const confirmButton = await screen.findByRole("button", { name: "Run now?" });

    mockApi.mockResolvedValueOnce({}); // POST /jobs succeeds
    mockApi.mockRejectedValueOnce(new Error("reload failed")); // follow-up reload fails
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    // keepDataOnError must not apply here: this is an action-triggered reload,
    // not the poll, so stale pre-job data (which has no running job, and would
    // otherwise silently prevent the poll effect from ever starting) is
    // cleared rather than left stranded on screen.
    await waitFor(() => expect(screen.queryByText("Seed Quran")).not.toBeInTheDocument());
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
