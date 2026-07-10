import { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpandMenu } from "@/components/canvas/ExpandMenu";

function Harness({ initialOpen = true }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div>
      <button data-testid="trigger" onClick={() => setOpen(true)}>
        Expand connections
      </button>
      {open && <ExpandMenu onSelect={vi.fn()} onClose={() => setOpen(false)} existingCounts={{}} />}
    </div>
  );
}

describe("ExpandMenu", () => {
  it("traps Tab within the three options, wrapping last to first and first to last", async () => {
    render(<Harness />);
    const options = screen.getAllByRole("button", { name: /By / });
    expect(options).toHaveLength(3);
    const [first, , last] = options;

    await act(async () => {
      last.focus();
    });
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("focuses the first option on open", () => {
    render(<Harness />);
    const options = screen.getAllByRole("button", { name: /By / });
    expect(document.activeElement).toBe(options[0]);
  });

  it("returns focus to the trigger when the menu closes", async () => {
    render(<Harness initialOpen={false} />);
    const trigger = screen.getByTestId("trigger");
    await act(async () => {
      trigger.focus();
    });
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(screen.getAllByRole("button", { name: /By / })).toHaveLength(3);

    fireEvent.keyDown(document, { key: "Escape" });

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});
