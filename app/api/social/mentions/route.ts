import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { noteMentions, users } from "@/lib/infra/db/schema";
import { requireUser } from "@/lib/auth/social-auth";
import { jsonError, parseJson, parsePagination } from "@/lib/infra/http";

export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const { userId } = authed;
  const { limit, offset } = parsePagination(req);

  const rows = await db
    .select({
      id: noteMentions.id,
      noteId: noteMentions.noteId,
      verseRef: noteMentions.verseRef,
      read: noteMentions.read,
      createdAt: noteMentions.createdAt,
      mentioningUsername: users.username,
    })
    .from(noteMentions)
    .innerJoin(users, eq(users.id, noteMentions.mentioningUserId))
    .where(eq(noteMentions.mentionedUserId, userId))
    .orderBy(desc(noteMentions.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);

  return NextResponse.json({ items, hasMore, unreadCount: await countUnread(userId) });
}

async function countUnread(userId: number): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(noteMentions)
    .where(and(eq(noteMentions.mentionedUserId, userId), eq(noteMentions.read, false)));
  return count;
}

const MAX_MARK_READ_IDS = 100;

/**
 * Marks the given mentions (the ones the page actually displayed) as read, so
 * older pages the user hasn't loaded stay unread. Returns what is still unread.
 */
export async function PATCH(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const body = await parseJson<{ ids?: unknown }>(req);
  const ids = body?.ids;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_MARK_READ_IDS ||
    !ids.every((id) => Number.isInteger(id) && id > 0)
  ) {
    return jsonError(`ids must be 1–${MAX_MARK_READ_IDS} positive integers`, 400);
  }

  await db
    .update(noteMentions)
    .set({ read: true })
    .where(
      and(
        eq(noteMentions.mentionedUserId, authed.userId),
        inArray(noteMentions.id, ids as number[]),
        eq(noteMentions.read, false)
      )
    );

  return NextResponse.json({ ok: true, unreadCount: await countUnread(authed.userId) });
}
