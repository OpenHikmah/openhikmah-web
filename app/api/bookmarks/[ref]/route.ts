import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { bookmarks } from "@/lib/infra/db/schema";
import { requireUser } from "@/lib/auth/social-auth";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const { ref } = await params;
  const verseRef = ref;

  try {
    await db
      .delete(bookmarks)
      .where(and(eq(bookmarks.userId, authed.userId), eq(bookmarks.verseRef, verseRef)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("bookmarks DELETE db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
