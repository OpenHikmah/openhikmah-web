import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AdminLiveRegion, useAdminAnnounce } from "@/components/admin/AdminLiveRegion";

function Announcer() {
  const announce = useAdminAnnounce();
  return <button onClick={() => announce("Connection 7 set to retired.")}>go</button>;
}

describe("AdminLiveRegion", () => {
  it("renders a polite status region and fills it when announce() is called", async () => {
    render(
      <AdminLiveRegion>
        <Announcer />
      </AdminLiveRegion>
    );

    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("");

    fireEvent.click(screen.getByText("go"));
    await waitFor(() => expect(region).toHaveTextContent("Connection 7 set to retired."));
  });

  it("no-ops safely when used outside a provider", () => {
    render(<Announcer />);
    // Should not throw on click even though there's no live region mounted.
    fireEvent.click(screen.getByText("go"));
  });
});
