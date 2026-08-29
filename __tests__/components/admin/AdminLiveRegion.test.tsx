import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { AdminLiveRegion, useAdminAnnounce } from "@/components/admin/AdminLiveRegion";

function Announcer({ message = "Connection 7 set to retired." }: { message?: string }) {
  const announce = useAdminAnnounce();
  return <button onClick={() => announce(message)}>go {message}</button>;
}

afterEach(() => {
  vi.useRealTimers();
});

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

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(region).toHaveTextContent("Connection 7 set to retired."));
  });

  it("no-ops safely when used outside a provider", () => {
    render(<Announcer />);
    // Should not throw on click even though there's no live region mounted.
    fireEvent.click(screen.getByRole("button"));
  });

  it("a second announcement replaces the first and resets the 5s expiry", async () => {
    vi.useFakeTimers();
    function TwoAnnouncers() {
      const announce = useAdminAnnounce();
      return (
        <>
          <button onClick={() => announce("first")}>a</button>
          <button onClick={() => announce("second")}>b</button>
        </>
      );
    }
    render(
      <AdminLiveRegion>
        <TwoAnnouncers />
      </AdminLiveRegion>
    );
    const region = screen.getByRole("status");

    fireEvent.click(screen.getByText("a"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(region).toHaveTextContent("first");

    // 4s later — before the first message would expire — announce again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    fireEvent.click(screen.getByText("b"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(region).toHaveTextContent("second");

    // The original 5s timer would have fired by now; the message must still hold.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(region).toHaveTextContent("second");

    // 5s from the second announcement — now it clears.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(region).toHaveTextContent("");
  });
});
