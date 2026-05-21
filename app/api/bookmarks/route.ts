import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookmarks } from "@/lib/db/schema";
import { requireUser } from "@/lib/social-auth";

export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return NextResponse.json({ refs: [] });

  const rows = await db
    .select({ verseRef: bookmarks.verseRef })
    .from(bookmarks)
    .where(eq(bookmarks.userId, authed.userId));

  return NextResponse.json({ refs: rows.map((r) => r.verseRef) });
}

export async function POST(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  let body: { ref?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const ref = body.ref?.trim();
  if (!ref || !/^\d+:\d+$/.test(ref)) {
    return NextResponse.json({ error: "Invalid verse ref" }, { status: 400 });
  }

  await db
    .insert(bookmarks)
    .values({ userId: authed.userId, verseRef: ref })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true });
}
