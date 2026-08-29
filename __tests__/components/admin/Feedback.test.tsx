import { render, screen, renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Feedback } from "@/components/admin/Feedback";
import { useActionMessage } from "@/components/admin/useActionMessage";

describe("Feedback", () => {
  it("renders an error in the error colour and an assertive live region", () => {
    render(<Feedback tone="error">Save failed.</Feedback>);
    const el = screen.getByText("Save failed.");
    expect(el).toHaveClass("text-error");
    expect(el).toHaveAttribute("aria-live", "assertive");
  });

  it("renders a success in the teal colour, politely", () => {
    render(<Feedback tone="success">Saved.</Feedback>);
    const el = screen.getByText("Saved.");
    expect(el).toHaveClass("text-teal");
    expect(el).toHaveAttribute("aria-live", "polite");
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
