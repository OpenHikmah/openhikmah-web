import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Checkbox } from "@/components/ui";

describe("Checkbox", () => {
  it("renders a native checkbox that reports changes", () => {
    const onChange = vi.fn();
    render(<Checkbox aria-label="Active" checked={false} onChange={onChange} />);

    const box = screen.getByRole("checkbox", { name: "Active" });
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("passes disabled through to the native control", () => {
    render(<Checkbox aria-label="Active" disabled checked={false} onChange={() => {}} />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("merges a caller className with the base styling", () => {
    render(<Checkbox aria-label="x" className="mt-0.5" />);
    const box = screen.getByRole("checkbox");
    expect(box).toHaveClass("mt-0.5");
    expect(box).toHaveClass("accent-gold");
  });
});
