import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { friendships, users } from "@/lib/infra/db/schema";

// 3-20 word chars, matching the username format enforced by app/api/social/me.
// The lookbehind rejects an "@" glued to a word char or another "@", so email
// addresses ("a@b.com") and "@@bob" are not mentions.
const MENTION_RE = /(?<![\w@])@(\w{3,20})\b/g;

// Bounds the username lookup per note; a note can hold thousands of tokens.
export const MAX_MENTIONS_PER_NOTE = 20;

/** Extracts up to MAX_MENTIONS_PER_NOTE unique @username tokens (without the @) from free-text note content. */
export function parseMentionedUsernames(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) {
    seen.add(match[1].toLowerCase());
    if (seen.size === MAX_MENTIONS_PER_NOTE) break;
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
    .where(inArray(sql`lower(${users.username})`, usernames));

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
