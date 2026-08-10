import { render as rtlRender, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FriendList } from "@/components/social/FriendList";
import { TooltipProvider } from "@/components/ui";
import { useAuthStore } from "@/store/auth";

function render(ui: React.ReactElement) {
  return rtlRender(<TooltipProvider>{ui}</TooltipProvider>);
}

function friend(overrides: Partial<Parameters<typeof FriendList>[0]["friends"][number]> = {}) {
  return {
    id: 1,
    status: "accepted" as const,
    direction: "sent" as const,
    friend: { id: 2, username: "yusuf", streak: 3 },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("FriendList confirm-before-destroy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAuthStore.setState({ accessToken: "test-token" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not fire the DELETE request on a single click of remove friend", () => {
    render(<FriendList friends={[friend()]} onUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove friend" }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("fires the DELETE request only after a second confirming click", () => {
    render(<FriendList friends={[friend()]} onUpdate={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Remove friend" });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "Click again to confirm" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/social/friends/1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("re-arms instead of confirming if the window elapses between clicks", () => {
    render(<FriendList friends={[friend()]} onUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove friend" }));
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Back to the idle label — the armed state auto-disarmed.
    expect(screen.getByRole("button", { name: "Remove friend" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not fire the DELETE request on a single click of cancel sent request", () => {
    render(
      <FriendList friends={[friend({ status: "pending", direction: "sent" })]} onUpdate={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("fires the DELETE request for a sent request only after a second confirming click", () => {
    render(
      <FriendList friends={[friend({ status: "pending", direction: "sent" })]} onUpdate={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    fireEvent.click(screen.getByRole("button", { name: "Click again to confirm" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/social/friends/1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("does not require confirmation to accept or decline a received request", () => {
    render(
      <FriendList
        friends={[friend({ status: "pending", direction: "received" })]}
        onUpdate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Decline request" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/social/friends/1",
      expect.objectContaining({ method: "PATCH" })
    );
  });
});
