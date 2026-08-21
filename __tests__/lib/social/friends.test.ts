import { describe, it, expect } from "vitest";
import { countPendingReceived } from "@/lib/social/friends";

describe("countPendingReceived", () => {
  it("returns 0 for an empty list", () => {
    expect(countPendingReceived([])).toBe(0);
  });

  it("counts only pending+received entries", () => {
    const friends = [
      { status: "pending", direction: "received" },
      { status: "pending", direction: "sent" },
      { status: "accepted", direction: "received" },
      { status: "pending", direction: "received" },
    ];
    expect(countPendingReceived(friends)).toBe(2);
  });

  it("ignores entries missing status/direction", () => {
    expect(countPendingReceived([{}, { status: "pending" }, { direction: "received" }])).toBe(0);
  });
});
