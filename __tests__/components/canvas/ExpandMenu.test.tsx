import { useState } from "react";
import { screen, fireEvent, act } from "@testing-library/react";
import { renderWithIntl } from "../../test-utils/render-with-intl";
import { describe, expect, it, vi } from "vitest";
import { ExpandMenu } from "@/components/canvas/ExpandMenu";

function Harness({ initialOpen = true }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div>
      <button data-testid="trigger" onClick={() => setOpen(true)}>
        Expand connections
      </button>
      {open && <ExpandMenu verseRef="2:153" onSelect={vi.fn()} onClose={() => setOpen(false)} />}
    </div>
  );
}

describe("ExpandMenu", () => {
  it("traps Tab within the three options, wrapping last to first and first to last", async () => {
    renderWithIntl(<Harness />);
    const options = screen.getAllByRole("menuitem");
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
    renderWithIntl(<Harness />);
    const options = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(options[0]);
  });

  it("returns focus to the trigger when the menu closes", async () => {
    renderWithIntl(<Harness initialOpen={false} />);
    const trigger = screen.getByTestId("trigger");
    await act(async () => {
      trigger.focus();
    });
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);

    fireEvent.keyDown(document, { key: "Escape" });

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("names the verse and lists the three kinds without counts", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    renderWithIntl(<ExpandMenu verseRef="2:153" onSelect={onSelect} onClose={onClose} />);

    const menu = screen.getByRole("menu", { name: "Find linked verses" });
    expect(menu).toHaveTextContent("2:153");
    expect(menu).not.toHaveTextContent(/found/i);
    expect(screen.getAllByRole("menuitem").map((b) => b.textContent)).toEqual([
      "◈By themeSame theological meaning",
      "عBy root wordShared Arabic root",
      "↔By contrastOpposing concept",
    ]);

    fireEvent.click(screen.getAllByRole("menuitem")[1]);
    expect(onSelect).toHaveBeenCalledWith("root");
    expect(onClose).toHaveBeenCalled();
  });
});
