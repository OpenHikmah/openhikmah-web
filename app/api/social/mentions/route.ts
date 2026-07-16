import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { noteMentions, users } from "@/lib/infra/db/schema";
import { requireUser } from "@/lib/auth/social-auth";
import { parsePagination } from "@/lib/infra/http";

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

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(noteMentions)
    .where(and(eq(noteMentions.mentionedUserId, userId), eq(noteMentions.read, false)));

  return NextResponse.json({ items, hasMore, unreadCount: count });
}

/** Marks every unread mention for the caller as read — called when the mentions panel opens. */
export async function PATCH(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  await db
    .update(noteMentions)
    .set({ read: true })
    .where(and(eq(noteMentions.mentionedUserId, authed.userId), eq(noteMentions.read, false)));

  return NextResponse.json({ ok: true });
}
