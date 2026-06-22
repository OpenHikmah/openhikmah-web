import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookmarks } from "@/lib/db/schema";
import { requireUser } from "@/lib/social-auth";
import { isValidRef } from "@/lib/quran-corpus";
import { jsonError, parseJson } from "@/lib/http";

export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  try {
    // Cap the result set: bookmarks are tiny ref strings, but the list is otherwise
    // unbounded per user. 2000 is far above any realistic library; newest first.
    const rows = await db
      .select({ verseRef: bookmarks.verseRef })
      .from(bookmarks)
      .where(eq(bookmarks.userId, authed.userId))
      .orderBy(desc(bookmarks.createdAt))
      .limit(2000);

    return NextResponse.json({ refs: rows.map((r) => r.verseRef) });
  } catch (err) {
    console.error("bookmarks GET db error:", err);
    return jsonError("Internal server error", 500);
  }
}

export async function POST(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const body = await parseJson<{ ref?: string }>(req);
  if (!body) return jsonError("Invalid request body", 400);

  const ref = body.ref?.trim();
  if (!ref || !isValidRef(ref)) {
    return jsonError("Invalid verse ref", 400);
  }

  try {
    await db
      .insert(bookmarks)
      .values({ userId: authed.userId, verseRef: ref })
      .onConflictDoNothing();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("bookmarks POST db error:", err);
    return jsonError("Internal server error", 500);
  }
}
