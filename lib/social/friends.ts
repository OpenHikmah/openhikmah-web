interface PendingCountable {
  status?: string;
  direction?: string;
}

/** Count of incoming pending friend requests — drives the friends badge. */
export function countPendingReceived(friends: PendingCountable[]): number {
  return friends.filter((f) => f.status === "pending" && f.direction === "received").length;
}
