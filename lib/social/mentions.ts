import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { friendships, users } from "@/lib/infra/db/schema";

// @username: word chars only, matching the existing username convention
// (see users.username in lib/infra/db/schema.ts) — no spaces/punctuation, so
// a mention token ends cleanly at sentence punctuation like "@alice, thanks".
const MENTION_RE = /@(\w+)/g;

/** Extracts unique @username tokens (without the @) from free-text note content. */
export function parseMentionedUsernames(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) {
    seen.add(match[1].toLowerCase());
  }
  return [...seen];
}

/**
 * Resolves parsed @usernames to real users, scoped to `mentioningUserId`'s
 * accepted friends only (see #117 — mentions are friends-only, matching the
 * existing social graph's trust boundary, not platform-wide). Case-insensitive,
 * matching the lookup convention already used for friend search.
 */
export async function resolveFriendMentions(
  mentioningUserId: number,
  usernames: string[]
): Promise<Array<{ id: number; username: string }>> {
  if (usernames.length === 0) return [];

  const candidates = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(or(...usernames.map((u) => sql`lower(${users.username}) = ${u}`)));

  if (candidates.length === 0) return [];

  const candidateIds = candidates.map((c) => c.id);
  const acceptedFriendships = await db
    .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(
          and(
            eq(friendships.requesterId, mentioningUserId),
            inArray(friendships.addresseeId, candidateIds)
          ),
          and(
            eq(friendships.addresseeId, mentioningUserId),
            inArray(friendships.requesterId, candidateIds)
          )
        )
      )
    );

  const friendIds = new Set(
    acceptedFriendships.map((f) =>
      f.requesterId === mentioningUserId ? f.addresseeId : f.requesterId
    )
  );

  return candidates.filter((c) => friendIds.has(c.id));
}
