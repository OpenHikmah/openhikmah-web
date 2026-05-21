import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { verseNotes } from "@/lib/db/schema";
import { requireUser } from "@/lib/social-auth";

export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const ref = req.nextUrl.searchParams.get("ref");
  if (!ref) {
    return NextResponse.json({ error: "Missing ref" }, { status: 400 });
  }

  const notes = await db
    .select()
    .from(verseNotes)
    .where(and(eq(verseNotes.userId, authed.userId), eq(verseNotes.verseRef, ref)));

  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  let body: { ref?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const ref = body.ref?.trim();
  const note = body.note?.trim();
  if (!ref || !note) {
    return NextResponse.json({ error: "Missing ref or note" }, { status: 400 });
  }

  const [inserted] = await db
    .insert(verseNotes)
    .values({ userId: authed.userId, verseRef: ref, note })
    .returning();

  return NextResponse.json(inserted, { status: 201 });
}
