import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookmarks } from "@/lib/db/schema";
import { requireUser } from "@/lib/social-auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const { ref } = await params;
  const verseRef = decodeURIComponent(ref);

  await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, authed.userId), eq(bookmarks.verseRef, verseRef)));

  return NextResponse.json({ ok: true });
}
