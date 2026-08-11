import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const suggestion = {
  id: 1,
  title: "A week of patience",
  description: null,
  verseRef: "2:155",
  suggestedDuration: "7d",
  isActive: true,
  sortOrder: 0,
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const mockApi = vi.fn();
vi.mock("@/components/admin/AdminContext", async () => {
  const actual = await vi.importActual("@/components/admin/AdminContext");
  return {
    ...actual,
    useAdminFetch: () => mockApi,
  };
});

import { ChallengeSuggestionsManager } from "@/components/admin/ChallengeSuggestionsManager";

describe("ChallengeSuggestionsManager — duplicate-request guards", () => {
  beforeEach(() => {
    mockApi.mockReset();
  });

  it("guards Create against a duplicate POST on rapid double-click", async () => {
    mockApi.mockResolvedValueOnce({ suggestions: [] }); // initial load
    const save = deferred<unknown>();
    mockApi.mockReturnValueOnce(save.promise); // the POST itself

    render(<ChallengeSuggestionsManager />);
    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText("e.g. A week of patience"), {
      target: { value: "New suggestion" },
    });

    const createButton = screen.getByRole("button", { name: "Create" });
    fireEvent.click(createButton);
    fireEvent.click(createButton);
    fireEvent.click(createButton);

    expect(mockApi).toHaveBeenCalledTimes(2); // initial load + exactly one POST
    save.resolve({});
  });

  it("guards a row's toggle against a duplicate PUT on rapid double-click", async () => {
    mockApi.mockResolvedValueOnce({ suggestions: [suggestion] }); // initial load
    const toggle = deferred<unknown>();
    mockApi.mockReturnValueOnce(toggle.promise); // the PUT itself

    render(<ChallengeSuggestionsManager />);
    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(1));

    const toggleButton = await screen.findByRole("button", {
      name: 'Deactivate suggestion "A week of patience"',
    });
    fireEvent.click(toggleButton);
    fireEvent.click(toggleButton);
    fireEvent.click(toggleButton);

    expect(mockApi).toHaveBeenCalledTimes(2); // initial load + exactly one PUT
    toggle.resolve({});
  });

  it("disables Edit/Delete for other rows while one row's action is in flight", async () => {
    mockApi.mockResolvedValueOnce({ suggestions: [suggestion] }); // initial load
    const toggle = deferred<unknown>();
    mockApi.mockReturnValueOnce(toggle.promise); // the PUT itself

    render(<ChallengeSuggestionsManager />);
    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(1));

    const toggleButton = await screen.findByRole("button", {
      name: 'Deactivate suggestion "A week of patience"',
    });
    fireEvent.click(toggleButton);

    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();

    toggle.resolve({});
  });
});
