import { render, screen, waitFor, act } from "@testing-library/react";
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
});
