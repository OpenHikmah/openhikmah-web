import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

import { AdminShell } from "@/components/admin/AdminShell";
import { AdminContext } from "@/components/admin/AdminContext";

function renderShell() {
  return render(
    <AdminContext.Provider value={{ adminQfId: "qf-1", username: "operator" }}>
      <AdminShell>
        <div>work area</div>
      </AdminShell>
    </AdminContext.Provider>
  );
}

describe("AdminShell — responsive mobile layout", () => {
  it("hides the persistent sidebar off-screen on mobile and shows a hamburger trigger instead", () => {
    renderShell();

    const aside = document.querySelector("aside");
    expect(aside).toHaveClass("hidden");

    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
  });

  it("opens an off-canvas drawer with the nav when the hamburger is pressed, and closes on Escape", () => {
    renderShell();

    expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();
    // The desktop aside's own "Overview" link plus the drawer's — the drawer
    // duplicates the same nav content rather than moving it.
    expect(screen.getAllByRole("link", { name: /Overview/ }).length).toBe(2);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();
  });

  it("closes on an outside click, but not on a click on the hamburger trigger itself", () => {
    renderShell();

    const trigger = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();

    // A mousedown on the trigger (e.g. re-clicking it to close) must not be
    // treated as an "outside" click — that raced with the trigger's own click
    // toggle in a past bug (MoreSheet, commit d8ea69e) and reopened the panel.
    fireEvent.mouseDown(trigger);
    expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();
  });
});
