import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RefreshButton } from "@/components/admin/RefreshButton";

describe("RefreshButton", () => {
  it("renders 'Refresh' and calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<RefreshButton onClick={onClick} />);

    const btn = screen.getByRole("button", { name: /refresh/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows the loading label and disables itself while loading", () => {
    const onClick = vi.fn();
    render(<RefreshButton onClick={onClick} loading />);

    const btn = screen.getByRole("button", { name: /refreshing/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});
