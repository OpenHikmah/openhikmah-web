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

import PromptsPage from "@/app/admin/prompts/page";

describe("PromptsPage — Create & activate requires confirmation", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue({ versions: [] });
  });

  it("does not create a version on the first click, only after a confirming second click", async () => {
    render(<PromptsPage />);

    const textarea = await screen.findByPlaceholderText(/Reference: {{fromRef}}/);
    fireEvent.change(textarea, { target: { value: "New template body" } });

    const createButton = screen.getByRole("button", { name: "Create & activate" });
    fireEvent.click(createButton);

    expect(mockApi).not.toHaveBeenCalledWith(
      "/prompts",
      expect.objectContaining({ method: "POST" })
    );
    expect(await screen.findByRole("button", { name: "Create & activate?" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create & activate?" }));

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/prompts", {
        method: "POST",
        json: { key: "connection.legacy", template: "New template body" },
      })
    );
  });

  it("locks the draft textarea while armed so the confirmed content can't change before the second click", async () => {
    render(<PromptsPage />);

    const textarea = await screen.findByPlaceholderText(/Reference: {{fromRef}}/);
    fireEvent.change(textarea, { target: { value: "Template A" } });

    fireEvent.click(screen.getByRole("button", { name: "Create & activate" }));
    expect(await screen.findByRole("button", { name: "Create & activate?" })).toBeInTheDocument();

    expect(textarea).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Create & activate?" }));

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/prompts", {
        method: "POST",
        json: { key: "connection.legacy", template: "Template A" },
      })
    );
  });

  it("locks the slot selector while armed, so a confirmed create can't land in a different slot", async () => {
    render(<PromptsPage />);

    const textarea = await screen.findByPlaceholderText(/Reference: {{fromRef}}/);
    fireEvent.change(textarea, { target: { value: "Template A" } });

    fireEvent.click(screen.getByRole("button", { name: "Create & activate" }));
    expect(await screen.findByRole("button", { name: "Create & activate?" })).toBeInTheDocument();

    const otherSlot = screen.getByRole("button", { name: "connection.selection" });
    expect(otherSlot).toBeDisabled();
    fireEvent.click(otherSlot);

    fireEvent.click(screen.getByRole("button", { name: "Create & activate?" }));

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/prompts", {
        method: "POST",
        json: { key: "connection.legacy", template: "Template A" },
      })
    );
  });
});
