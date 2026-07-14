import { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExportMenu } from "@/components/canvas/ExportMenu";

function Harness({ initialOpen = true }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const onSelect = vi.fn();
  return (
    <div>
      <button data-testid="trigger" onClick={() => setOpen(true)}>
        Export
      </button>
      {open && <ExportMenu onSelect={onSelect} onClose={() => setOpen(false)} />}
    </div>
  );
}

describe("ExportMenu", () => {
  it("offers PNG and PDF options", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /PNG/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PDF/ })).toBeInTheDocument();
  });

  it("calls onSelect with the chosen format and closes", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<ExportMenu onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /PDF/ }));
    expect(onSelect).toHaveBeenCalledWith("pdf");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    render(<Harness />);
    fireEvent.keyDown(document, { key: "Escape" });
    await vi.waitFor(() => {
      expect(screen.queryByRole("button", { name: /PNG/ })).not.toBeInTheDocument();
    });
  });

  it("returns focus to the trigger when the menu closes", async () => {
    render(<Harness initialOpen={false} />);
    const trigger = screen.getByTestId("trigger");
    await act(async () => {
      trigger.focus();
    });
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: /PNG/ })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});
