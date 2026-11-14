import { render, screen, renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ActionFeedback, Feedback } from "@/components/admin/Feedback";
import { useActionMessage } from "@/components/admin/useActionMessage";

describe("Feedback", () => {
  it("renders an error in the error colour and an assertive live region", () => {
    render(<Feedback tone="error">Save failed.</Feedback>);
    const el = screen.getByText("Save failed.");
    expect(el).toHaveClass("text-error");
    expect(el).toHaveAttribute("aria-live", "assertive");
    expect(el).toHaveAttribute("role", "alert");
  });

  it("renders a success in the teal colour, politely", () => {
    render(<Feedback tone="success">Saved.</Feedback>);
    const el = screen.getByText("Saved.");
    expect(el).toHaveClass("text-teal");
    expect(el).toHaveAttribute("aria-live", "polite");
    expect(el).toHaveAttribute("role", "status");
  });
});

describe("ActionFeedback", () => {
  it("keeps the status region mounted while empty, then fills the same node", () => {
    const { rerender } = render(<ActionFeedback message={null} />);
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).toBeNull();

    rerender(<ActionFeedback message={{ tone: "success", text: "Saved." }} />);
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Saved.");
  });

  it("renders an error as a conditional alert and leaves the status region empty", () => {
    const { rerender } = render(
      <ActionFeedback message={{ tone: "error", text: "Save failed." }} />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Save failed.");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    rerender(<ActionFeedback message={null} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("useActionMessage", () => {
  it("keeps the tone bound to the text so a failure can't render as success", () => {
    const { result } = renderHook(() => useActionMessage());
    act(() => result.current.ok("Saved."));
    expect(result.current.message).toEqual({ tone: "success", text: "Saved." });
    act(() => result.current.fail("Save failed."));
    expect(result.current.message).toEqual({ tone: "error", text: "Save failed." });
    act(() => result.current.clear());
    expect(result.current.message).toBeNull();
  });
});
