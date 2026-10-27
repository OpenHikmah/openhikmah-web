import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorState } from "@/components/admin/primitives";

describe("ErrorState", () => {
  it("announces the failure as an alert", () => {
    render(<ErrorState>Could not load users.</ErrorState>);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load users.");
  });

  it("offers Retry only when a handler is given, and calls it", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorState>Boom.</ErrorState>);
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();

    rerender(<ErrorState onRetry={onRetry}>Boom.</ErrorState>);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
