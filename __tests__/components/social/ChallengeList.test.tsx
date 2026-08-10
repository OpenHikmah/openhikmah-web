import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChallengeList, type EnrichedChallenge } from "@/components/social/ChallengeList";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";

function challenge(overrides: Partial<EnrichedChallenge> = {}): EnrichedChallenge {
  return {
    id: 1,
    challengerId: 2,
    challengedId: 1,
    challengerUsername: "yusuf",
    challengedUsername: "me",
    verseRef: "2:255",
    status: "pending",
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    winnerId: null,
    challengerScore: 0,
    challengedScore: 0,
    ...overrides,
  };
}

describe("ChallengeCard PATCH error handling", () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: "test-token" });
    useSocialStore.setState({ userId: 1 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not call onUpdate and shows an error when the accept PATCH fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({}) })
    );
    const onUpdate = vi.fn();
    render(<ChallengeList challenges={[challenge()]} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: /accept/i }));

    await waitFor(() => {
      expect(screen.getByText("Couldn't accept — try again.")).toBeInTheDocument();
    });
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("does not call onUpdate and shows a network error when the PATCH throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const onUpdate = vi.fn();
    render(<ChallengeList challenges={[challenge()]} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: /decline/i }));

    await waitFor(() => {
      expect(screen.getByText("Network error — try again.")).toBeInTheDocument();
    });
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("calls onUpdate on a successful accept PATCH", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    );
    const onUpdate = vi.fn();
    render(<ChallengeList challenges={[challenge()]} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: /accept/i }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
  });
});
