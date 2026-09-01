import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AdminToggle } from "@/components/admin/AdminToggle";

const OPTIONS = [
  { value: "all", label: "All" },
  { value: "flagged", label: "Flagged" },
] as const;

describe("AdminToggle", () => {
  it("marks the active option with aria-pressed", () => {
    render(<AdminToggle options={OPTIONS} value="flagged" onChange={() => {}} label="Status" />);
    expect(screen.getByRole("button", { name: "Flagged" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  });

  it("emits the chosen value on click", () => {
    const onChange = vi.fn();
    render(<AdminToggle options={OPTIONS} value="all" onChange={onChange} label="Status" />);
    fireEvent.click(screen.getByRole("button", { name: "Flagged" }));
    expect(onChange).toHaveBeenCalledWith("flagged");
  });

  it("groups the options and does not fire when a disabled option is clicked", () => {
    const onChange = vi.fn();
    render(
      <AdminToggle
        options={[...OPTIONS, { value: "retired", label: "Retired", disabled: true }]}
        value="all"
        onChange={onChange}
        label="Status"
      />
    );
    expect(screen.getByRole("group", { name: "Status" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retired" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
